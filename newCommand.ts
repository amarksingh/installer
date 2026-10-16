import fs from 'fs';
import child_process from 'child_process';
import readline from 'readline';
import os from 'os';
import path from 'path';
import Command from '@ostro/console/command';
import type { ExecOptions, ExecSyncOptions } from 'child_process';

interface NewCommand {
    input: {
        getArgument(name: string): string;
        getOption(name: string): unknown;
    };
    output: {
        write(message: string): void;
        writeln(message: string): void;
    };
    info(message: string): void;
    error(message: unknown): void;
}

/**
 * Command class for initializing a new OstroJS application across Linux, macOS, and Windows.
 */
class NewCommand extends Command {

    /**
     * The console command signature.
     */
    public get $signature(): string {
        return 'new';
    }

    /**
     * The console command description.
     */
    public get $description(): string {
        return 'Create a new OstroJS application';
    }

    /**
     * The console command options definition.
     */
    public get $options(): any[] {
        return [
            this.createOption('--dev', 'Installs the latest "development" release'),
            this.createOption('--force', 'Forces install even if the directory already exists').default(false)
        ];
    }

    /**
     * The console command arguments definition.
     */
    public get $arguments(): any[] {
        return [
            this.createArgument('name', 'The name of the application').required()
        ];
    }

    /**
     * Active spinner timer instance.
     */
    public spinnerTimer: NodeJS.Timeout | null = null;

    /**
     * Execute the console command.
     *
     * @returns A promise that resolves when installation completes.
     */
    public async handle(): Promise<void> {
        let directoryCreated: boolean = false;
        let $directory: string = '.';
        try {
            this.output.writeln(`<fg=cyan> 
                ___
              /     \\
             /       \\_____ \_____ _______\_\__
            |        / ___\|   \|   | \'__/  _  \\
            |        \\___ \\   |   | | \|  (_)  \|
             \\       /____\/   |   | |  \\ ___ \/
               \\ ___ /                     
            
             
         </>`);

            const $name: string = this.input.getArgument('name');
            $directory = $name !== '.' ? path.resolve(process.cwd(), $name) : '.';

            if (!this.input.getOption('force')) {
                this.verifyApplicationDoesntExist($directory);
            }

            if (this.input.getOption('force') && $directory === '.') {
                throw new Error('Cannot use --force option when using current directory for installation!');
            }

            const $currentVersion: string = (this.runCommandsSync(['npm show @ostro/installer version']) || '').trim();
            let $existingVersion: string = (this.runCommandsSync(['npm ls @ostro/installer -g version --depth=0']) || '');
            $existingVersion = $existingVersion.replace(/[^@]*@ostro\/installer@([\d.]+)\s*/, '$1').trim();

            this.output.write('[1/7] ');
            const versionMessage: string = $existingVersion === $currentVersion
                ? '@ostro/installer version verified'
                : 'Update required: "npm install @ostro/installer@latest -g"';

            if ($existingVersion !== $currentVersion) {
                this.error(versionMessage);
            } else {
                this.info(versionMessage);
            }

            const osType: string = os.type();
            if ($directory !== '.' && this.input.getOption('force')) {
                try {
                    fs.rmSync($directory, { force: true, recursive: true });
                } catch (e: unknown) {
                    this.error(e);
                }
            }
            fs.mkdirSync($directory, { recursive: true });
            directoryCreated = true;

            this.output.write('[2/7] ');
            this.info('Directory created');

            const $url: string = this.runCommandsSync(['npm v @ostro/ostro dist.tarball']);
            const $commands: string[] = [];

            if (osType === 'Windows_NT') {
                $commands.push(
                    `powershell -Command "Invoke-WebRequest -Uri '${$url.trim()}' -OutFile 'ostro.tar.gz'"`,
                    `tar -xzf ostro.tar.gz --strip 1`,
                    `powershell -Command "Remove-Item -Force 'ostro.tar.gz'"`
                );
            } else {
                $commands.push(
                    `curl -s "${$url.trim()}" | tar -xzf - --strip 1`,
                    `chmod 755 "${path.join($directory, 'assistant')}"`
                );
            }

            this.startSpinner('[3/7]', 'Crafting application...');
            await this.runCommandsAsync($commands, { cwd: $directory });
            this.stopSpinnerAndClear();
            this.output.write('[3/7] ');
            this.info('Application crafted');

            fs.copyFileSync(path.join($directory, '.env.example'), path.join($directory, '.env'));
            this.output.write('[4/7] ');
            this.info('Environment file generated');

            // Real-time single-line npm install log cross-platform (Debian, Linux, macOS, Windows)
            this.updateSingleLine('[5/7]', 'Installing dependencies...');
            await this.runNpmInstallWithRealtimeLog($directory, '[5/7]');
            this.clearLine();
            this.output.write('[5/7] ');
            this.info('Dependencies installed');

            this.startSpinner('[6/7]', 'Generating application key...');
            await this.runCommandsAsync(['node assistant key:generate'], { cwd: $directory });
            this.stopSpinnerAndClear();
            this.output.write('[6/7] ');
            this.info('Key generated');

            if ($name !== '.') {
                const dbName: string = $name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                this.replaceInFile('APP_URL=http://localhost', 'APP_URL=http://' + $name + '.test', path.join($directory, '.env'));
                this.replaceInFile('DB_DATABASE=ostro', 'DB_DATABASE=' + dbName, path.join($directory, '.env'));
                this.replaceInFile('DB_DATABASE=ostro', 'DB_DATABASE=' + dbName, path.join($directory, '.env.example'));
            }

            this.output.write('[7/7] ');
            this.info('Application setup completed');
            process.stdout.write('\n\n');
            this.output.writeln('<comment>Application ready! Build something amazing.</comment>');
            process.stdout.write('\n');
            this.output.writeln('<fg=cyan>cd ' + $name + '</fg>');
            this.output.writeln('<fg=cyan>node app.js</fg>');
        } catch (error: any) {
            this.stopSpinnerAndClear();
            process.stdout.write('\n');
            this.error(`\nInstallation failed: ${error.message}`);

            if (directoryCreated && $directory !== '.') {
                try {
                    fs.rmSync($directory, { force: true, recursive: true });
                    this.info(`Auto-removed failed directory: ${$directory}`);
                } catch (_) { }
            }
            process.exit(1);
        }
    }

    /**
     * Start an animated progress spinner for a given step.
     *
     * @param prefix - Step identifier (e.g. '[3/7]').
     * @param label - Progress label message.
     */
    public startSpinner(prefix: string, label: string): void {
        const frames: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i: number = 0;
        this.stopSpinner();
        this.spinnerTimer = setInterval((): void => {
            const frame: string = frames[i++ % frames.length];
            this.updateSingleLine(prefix, `${frame} ${label}`);
        }, 80);
    }

    /**
     * Stop the currently running progress spinner.
     */
    public stopSpinner(): void {
        if (this.spinnerTimer) {
            clearInterval(this.spinnerTimer);
            this.spinnerTimer = null;
        }
    }

    /**
     * Stop the active spinner and clear the current stdout terminal line.
     */
    public stopSpinnerAndClear(): void {
        this.stopSpinner();
        this.clearLine();
    }

    /**
     * Update the current terminal line with a single line message.
     *
     * @param prefix - Step label or prefix.
     * @param text - Message text to display.
     */
    public updateSingleLine(prefix: string, text: string): void {
        if (process.stdout.isTTY) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            const cols: number = process.stdout.columns || 80;
            let fullMsg: string = `${prefix} ${text}`;
            if (fullMsg.length > cols - 2) {
                fullMsg = fullMsg.substring(0, cols - 5) + '...';
            }
            process.stdout.write(fullMsg);
        }
    }

    /**
     * Clear the current line on TTY terminal output.
     */
    public clearLine(): void {
        if (process.stdout.isTTY) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
        }
    }

    /**
     * Run `npm install` asynchronously while streaming real-time output on a single line.
     * Uses system shell context and an active spinner to ensure non-blocking execution across OSes.
     *
     * @param directory - Path to the target directory.
     * @param prefix - Step label prefix.
     * @returns A promise that resolves when installation completes.
     */
    public runNpmInstallWithRealtimeLog(directory: string, prefix: string): Promise<void> {
        return new Promise<void>((resolve, reject): void => {
            const child: child_process.ChildProcess = child_process.exec('npm install', { cwd: directory });
            const frames: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
            let i: number = 0;
            let lastLogLine: string = 'Starting npm install...';

            const timer: NodeJS.Timeout = setInterval((): void => {
                const frame: string = frames[i++ % frames.length];
                this.updateSingleLine(prefix, `${frame} Installing... ${lastLogLine}`);
            }, 80);

            const handleOutput = (data: string | Buffer): void => {
                const lines: string[] = data.toString().split('\n').filter((line: string): boolean => Boolean(line.trim()));
                if (lines.length > 0) {
                    lastLogLine = lines[lines.length - 1].trim();
                }
            };

            child.stdout!.on('data', handleOutput);
            child.stderr!.on('data', handleOutput);

            child.on('close', (code: number | null): void => {
                clearInterval(timer);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`npm install failed with exit code ${code}`));
                }
            });

            child.on('error', (err: Error): void => {
                clearInterval(timer);
                reject(err);
            });
        });
    }

    /**
     * Execute shell commands asynchronously and return a Promise.
     *
     * @param commands - List of commands to execute sequentially.
     * @param options - Additional options for child_process.exec (e.g. { cwd }).
     * @returns Output from executed commands.
     */
    public runCommandsAsync(commands: string[], options: ExecOptions = {}): Promise<string> {
        return new Promise<string>((resolve, reject): void => {
            const cmd: string = commands.join(' && ');
            child_process.exec(cmd, { encoding: 'utf8', ...options }, (error: child_process.ExecException | null, stdout: string, stderr: string): void => {
                if (error) {
                    reject(new Error(stderr || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Execute shell commands synchronously.
     *
     * @param commands - List of commands to execute.
     * @param options - Additional options for child_process.execSync.
     * @returns Standard output from execution.
     */
    public runCommandsSync(commands: string[], options: ExecSyncOptions = {}): string {
        return child_process.execSync(commands.join(' && '), { encoding: 'utf8', ...options }) as string;
    }

    /**
     * Verify whether the target application directory already exists.
     *
     * @param $directory - Absolute target directory path.
     */
    public verifyApplicationDoesntExist($directory: string): void {
        try {
            const stat: fs.Stats = fs.statSync($directory);
            if ((stat.isDirectory() || stat.isFile()) && $directory !== process.cwd()) {
                this.error('Application already exists!');
                process.exit(1);
            }
        } catch (_e: unknown) {
            // Path does not exist, which is expected
        }
    }

    /**
     * Replace occurrences of a substring inside a target file.
     *
     * @param $search - String to search for.
     * @param $replace - Replacement string.
     * @param $file - Target file path.
     */
    public replaceInFile($search: string | RegExp, $replace: string, $file: string): void {
        fs.writeFileSync($file, fs.readFileSync($file, 'utf8').replace($search, $replace));
    }
}

Object.defineProperty(NewCommand, '__esModule', { value: true });
(NewCommand as any).default = NewCommand;

export default NewCommand;
