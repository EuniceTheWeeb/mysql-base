const express = require('express');
const hbs = require('hbs');
const wax = require('wax-on');
require('dotenv').config();
const { createConnection } = require('mysql2/promise');
const req = require('express/lib/request');
const helpers = require("handlebars-helpers")


let app = express();
app.set('view engine', 'hbs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

wax.on(hbs.handlebars);
wax.setLayoutPath('./views/layouts');

hbs.handlebars.registerHelper('includes', function (array, value) {
    // Check if the value exists in the array
    return array && array.indexOf(value) !== -1;
});

helpers({
    "handlebars": hbs.handlebars
});


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
    // app.get('/customers', async (req, res) => {
    //     const [customers] = await connection.execute({
    //         'sql': `
    //         SELECT * from Customers
    //             JOIN Companies ON Customers.company_id = Companies.company_id;
    //         `,
    //         nestTables: true
    //     });
    //     res.render('customers/index', {
    //         customers
    //     })
    // })

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
        if (employee_id) {
            for (let id of employee_id) {
                let query = 'INSERT INTO EmployeeCustomer (employee_id, customer_id) VALUES (?, ?)';
                let bindings = [id, newCustomerId];
                await connection.execute(query, bindings);
            }
        }
        res.redirect('/customers');
    })

    // MARK: Update/Edit
    app.get('/customers/:customer_id/edit', async (req, res) => {
        let [employees] = await connection.execute('SELECT * from Employees');
        let [companies] = await connection.execute('SELECT * FROM Companies');
        let [customers] = await connection.execute('SELECT * from Customers WHERE customer_id = ?', [req.params.customer_id]);
        let [employeeCustomers] = await connection.execute('SELECT * from EmployeeCustomer WHERE customer_id = ?', [req.params.customer_id]);

        let customer = customers[0];
        let relatedEmployees = employeeCustomers.map(ec => ec.employee_id);

        res.render('customers/edit', {
            customer,
            companies,
            employees,
            relatedEmployees
        });
    })

    app.post('/customers/:customer_id/edit', async (req, res) => {
        let { first_name, last_name, rating, company_id, employee_id } = req.body;
        let query = 'UPDATE Customers SET first_name=?, last_name=?, rating=?, company_id=? WHERE customer_id=?';
        let bindings = [first_name, last_name, rating, company_id, req.params.customer_id];
        await connection.execute(query, bindings);
        await connection.execute('DELETE FROM EmployeeCustomer WHERE customer_id = ?', [req.params.customer_id]);

        if (employee_id) {
            for (let id of employee_id) {
                let query = 'INSERT INTO EmployeeCustomer (employee_id, customer_id) VALUES (?, ?)';
                let bindings = [id, req.params.customer_id];
                await connection.execute(query, bindings);
            }
        }
        res.redirect('/customers');
    })

    // MARK: Delete
    app.get('/customers/:customer_id/delete', async function (req, res) {
        const [relatedEmployees] = await connection.execute(
            "SELECT * FROM EmployeeCustomer WHERE customer_id =?", [req.params.customer_id]
        )

        if (relatedEmployees.length > 0) {
            res.render("errors", {
                "errorMsg": "There are still employees serving this customer & we cannot delete yet."
            })
            return;
        }

        const [customers] = await connection.execute(
            "SELECT * FROM Customers WHERE customer_id =?", [req.params.customer_id]
        );
        const customer = customers[0];

        res.render('customers/delete', {
            customer
        })
    })

    app.post('/customers/:customer_id/delete', async function (req, res) {
        try {
            await connection.execute(`DELETE FROM Customers WHERE customer_id = ?`, [req.params.customer_id]);
            res.redirect('/customers');
        } catch (e) {
            res.render("errors", {
                "errorMsg": "Cannot delete customer."
            })
        }
    })

    app.get('/employees', async (req, res) => {
        res.render('employees/index');
    });

    // MARK: Search
    app.get('/customers', async function (req, res) {
        let query = `SELECT * FROM Customers 
        JOIN Companies ON Companies.company_id = Customers.company_id
        WHERE 1 `;

        let bindings = [];

        const { first_name, last_name, rating, company } = req.query;
        if (first_name) {
            query += `AND first_name LIKE ?`
            bindings.push('%' + first_name + '%')
        }
        if (last_name) {
            query += `AND last_name LIKE ?`
            bindings.push('%' + last_name + '%')
        }
        if (rating) {
            query += `AND rating LIKE ?`
            bindings.push('%' + rating + '%')
        }
        if (company) {
            query += `AND Companies.name LIKE ?`
            bindings.push('%' + company + '%')
        }
        console.log("query =>", query)
        const [customers] = await connection.execute({
            'sql': query,
            'nestTables': true
        }, bindings);

        console.log(customers);

        res.render('customers.hbs', {
            customers,
            'searchTerms': req.query
        });
    })
}
main();

// MARK: Always last
app.listen(3000, () => {
    console.log('Server is running')
});