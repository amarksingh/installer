#!/usr/bin/env node

/**
 * @file Index entry point for @ostro/installer CLI binary.
 * @module @ostro/installer
 */

require('@ostro/support/helpers');
const ConsoleApplication = require('@ostro/console');
const NewCommand = require('./newCommand');

/**
 * Initialize the Ostro Console Application instance.
 * @type {ConsoleApplication}
 */
const $app = new ConsoleApplication();

/**
 * Register available CLI commands.
 */
$app.add(new NewCommand());

/**
 * Parse CLI arguments and execute the matching command.
 * Exits with status code 0 on success, or status code 1 on error.
 */
$app.run(process.argv.slice(2))
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
