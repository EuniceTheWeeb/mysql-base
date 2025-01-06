const express = require('express');
const hbs = require('hbs');
const wax = require('wax-on');
require('dotenv').config();
const { createConnection } = require('mysql2/promise');
const helpers = require("handlebars-helpers")({
    handlebars: hbs.handlebars
})

let app = express();
app.set('view engine', 'hbs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

wax.on(hbs.handlebars);
wax.setLayoutPath('./views/layouts');

let connection;

async function main() {
    connection = await createConnection({
        'host': process.env.DB_HOST,
        'user': process.env.DB_USER,
        'database': process.env.DB_NAME,
        'password': process.env.DB_PASSWORD
    })

    app.get('/', (req, res) => {
        res.send('Hello, World!');
    });

    // MARK: read
    app.get('/customers', async (req, res) => {
        const [customers] = await connection.execute({
            'sql': `
            SELECT * from Customers
                JOIN Companies ON Customers.company_id = Companies.company_id;
            `,
            nestTables: true
        });
        res.render('customers/index', {
            customers
        })
    })

    // MARK: create
    app.get('/customers/create', async (req, res) => {
        let [companies] = await connection.execute('SELECT * from Companies');
        let [employees] = await connection.execute('SELECT * from Employees');
        res.render('customers/create', {
            companies,
            employees
        })
    })

    app.post('/customers/create', async (req, res) => {
        let { first_name, last_name, rating, company_id, employee_id } = req.body;
        let query = 'INSERT INTO Customers (first_name, last_name, rating, company_id) VALUES (?, ?, ?, ?)';
        let bindings = [first_name, last_name, rating, company_id];
        let [result] = await connection.execute(query, bindings);
        let newCustomerId = result.insertId;
        for (let id of employee_id) {
            let query = 'INSERT INTO EmployeeCustomer (employee_id, customer_id) VALUES (?, ?)';
            let bindings = [id, newCustomerId];
            await connection.execute(query, bindings);
            res.redirect('/customers');
        }
    })

    // MARK: Update/Edit
    app.get('/customers/:customer_id/edit', async (req, res) => {
        let [employees] = await connection.execute('SELECT * from Employees');
        let [customers] = await connection.execute('SELECT * from Customers WHERE customer_id = ?', [req.params.customer_id]);
        let [employeeCustomers] = await connection.execute('SELECT * from EmployeeCustomer WHERE customer_id = ?', [req.params.customer_id]);

        let customer = customers[0];
        let relatedEmployees = employeeCustomers.map(ec => ec.employee_id);

        res.render('customers/:customer_id/edit', {
            customer,
            companies,
            relatedEmployees
        })
    })

    app.post('/customers/:customer_id/edit', async (req, res) => {
        let { first_name, last_name, rating, company_id, employee_id } = req.body;
        let query = 'UPDATE Customers SET first_name=?, last_name=?, rating=?, company_id=? WHERE customer_id=?';
        await connection.execute(query, bindings);

        await connection.execute('DELETE FROM EmployeeCustomer WHERE customer_id = ?', [req.params.customer_id]);

        for (let id of employee_id) {
            let query = 'INSERT INTO EmployeeCustomer (employee_id, customer_id) VALUES (?, ?)';
            let bindings = [id, req.params.customer_id];
            await connection.execute(query, bindings);
        }
        res.redirect('/customers');
    })

    // MARK: Delete
    app.get('/customers/:customer_id/delete', async function (req, res) {
        // display a confirmation form 
        const [customers] = await connection.execute(
            "SELECT * FROM Customers WHERE customer_id =?", [req.params.customer_id]
        );
        const customer = customers[0];

        res.render('customers/delete', {
            customer
        })
    })

    app.post('/customers/:customer_id/delete', async function (req, res) {
        await connection.execute(`DELETE FROM Customers WHERE customer_id = ?`, [req.params.customer_id]);
        res.redirect('/customers');
    })

    app.get('/employees', (req, res) => {
        res.render('employees/index');
    });
}

main();

// MARK: Always last
app.listen(3000, () => {
    console.log('Server is running')
});