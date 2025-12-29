// Test connection with provided password and create database
const { Client } = require('pg');

async function setupDatabase() {
    const password = 'JohnWick.98';

    console.log('Connecting to PostgreSQL...');

    const client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: password,
        database: 'postgres' // Connect to default database first
    });

    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL successfully!');

        // Try to create database
        try {
            await client.query('CREATE DATABASE hitbyhuma_pos;');
            console.log('✅ Database "hitbyhuma_pos" created successfully!');
        } catch (createErr) {
            if (createErr.code === '42P04') {
                console.log('ℹ️  Database "hitbyhuma_pos" already exists - that\'s fine!');
            } else {
                console.log('⚠️  Could not create database:', createErr.message);
                throw createErr;
            }
        }

        await client.end();
        console.log('\n🎉 Setup complete! You can now run migrations with: npm run migrate');
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

setupDatabase();
