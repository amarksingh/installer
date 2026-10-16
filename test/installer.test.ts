import child_process from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { EventEmitter } from 'events';

// Ensure helpers are loaded
import '@ostro/support/helpers';
import NewCommand from '../newCommand';

describe('NewCommand', () => {
    let originalExit: typeof process.exit;
    let originalStdoutWrite: typeof process.stdout.write;
    let originalIsTTY: boolean | undefined;
    let originalColumns: number | undefined;

    beforeEach(() => {
        originalExit = process.exit;
        process.exit = jest.fn() as unknown as typeof process.exit;
        originalStdoutWrite = process.stdout.write;
        process.stdout.write = jest.fn() as unknown as typeof process.stdout.write;
        originalIsTTY = process.stdout.isTTY;
        originalColumns = process.stdout.columns;
    });

    afterEach(() => {
        process.exit = originalExit;
        process.stdout.write = originalStdoutWrite;
        process.stdout.isTTY = originalIsTTY;
        process.stdout.columns = originalColumns;
        jest.restoreAllMocks();
    });

    test('command signature, description, options, and arguments', () => {
        const cmd: NewCommand = new NewCommand();
        expect(cmd.$signature).toBe('new');
        expect(cmd.$description).toBe('Create a new OstroJS application');
        expect(cmd.$options.length).toBe(2);
        expect(cmd.$arguments.length).toBe(1);
    });

    test('replaceInFile replaces matching text in file', () => {
        const cmd: NewCommand = new NewCommand();
        const tmpFile: string = path.join(os.tmpdir(), `test-file-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, 'Hello World');
        try {
            cmd.replaceInFile('World', 'Ostro', tmpFile);
            expect(fs.readFileSync(tmpFile, 'utf8')).toBe('Hello Ostro');
        } finally {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        }
    });

    test('verifyApplicationDoesntExist passes when path does not exist', () => {
        const cmd: NewCommand = new NewCommand();
        const nonExistent: string = path.join(os.tmpdir(), `non-existent-${Date.now()}`);
        expect(() => cmd.verifyApplicationDoesntExist(nonExistent)).not.toThrow();
        expect(process.exit).not.toHaveBeenCalled();
    });

    test('verifyApplicationDoesntExist ignores current working directory', () => {
        const cmd: NewCommand = new NewCommand();
        expect(() => cmd.verifyApplicationDoesntExist(process.cwd())).not.toThrow();
        expect(process.exit).not.toHaveBeenCalled();
    });

    test('verifyApplicationDoesntExist exits when directory or file exists', () => {
        const cmd: NewCommand = new NewCommand();
        cmd.output = { writeln: jest.fn(), write: jest.fn() };
        cmd.error = jest.fn();

        const tmpDir: string = path.join(os.tmpdir(), `exists-${Date.now()}`);
        fs.mkdirSync(tmpDir);
        try {
            cmd.verifyApplicationDoesntExist(tmpDir);
            expect(cmd.error).toHaveBeenCalledWith('Application already exists!');
            expect(process.exit).toHaveBeenCalledWith(1);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('runCommandsSync executes shell command synchronously', () => {
        const cmd: NewCommand = new NewCommand();
        const out: string = cmd.runCommandsSync(['node -e "console.log(\'hello-sync\')"']);
        expect(out.trim()).toBe('hello-sync');
    });

    test('runCommandsAsync resolves on success and rejects on error', async () => {
        const cmd: NewCommand = new NewCommand();
        const out: string = await cmd.runCommandsAsync(['node -e "console.log(\'hello-async\')"']);
        expect(out.trim()).toBe('hello-async');

        await expect(cmd.runCommandsAsync(['node -e "process.exit(1)"'])).rejects.toThrow();
    });

    test('updateSingleLine and clearLine handle TTY and truncation', () => {
        const cmd: NewCommand = new NewCommand();
        process.stdout.isTTY = true;
        process.stdout.columns = 30;

        jest.spyOn(readline, 'clearLine').mockImplementation(() => true);
        jest.spyOn(readline, 'cursorTo').mockImplementation(() => true);

        // Short message
        cmd.updateSingleLine('[1/7]', 'short text');
        expect(process.stdout.write).toHaveBeenCalledWith('[1/7] short text');

        // Long message requiring truncation (columns = 30, max length = 28)
        cmd.updateSingleLine('[1/7]', 'a very long message that definitely exceeds 30 columns limit');
        expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('...'));

        // Non-TTY does not write
        process.stdout.isTTY = false;
        (process.stdout.write as unknown as jest.Mock).mockClear();
        cmd.updateSingleLine('[1/7]', 'ignored');
        expect(process.stdout.write).not.toHaveBeenCalled();

        // clearLine
        process.stdout.isTTY = true;
        cmd.clearLine();
        expect(readline.clearLine).toHaveBeenCalledWith(process.stdout, 0);

        process.stdout.isTTY = false;
        (readline.clearLine as unknown as jest.Mock).mockClear();
        cmd.clearLine();
        expect(readline.clearLine).not.toHaveBeenCalled();
    });

    test('spinner start, interval tick, and stop', () => {
        jest.useFakeTimers();
        const cmd: NewCommand = new NewCommand();
        const updateSpy = jest.spyOn(cmd, 'updateSingleLine').mockImplementation(() => {});
        const clearSpy = jest.spyOn(cmd, 'clearLine').mockImplementation(() => {});

        cmd.startSpinner('[3/7]', 'Crafting');
        expect(cmd.spinnerTimer).toBeDefined();

        // Advance timers to trigger interval
        jest.advanceTimersByTime(160);
        expect(updateSpy).toHaveBeenCalled();

        cmd.stopSpinnerAndClear();
        expect(cmd.spinnerTimer).toBeNull();
        expect(clearSpy).toHaveBeenCalled();

        // Calling stopSpinner again is a no-op
        expect(() => cmd.stopSpinner()).not.toThrow();
        jest.useRealTimers();
    });

    test('runNpmInstallWithRealtimeLog success, error, and close failure', async () => {
        jest.useFakeTimers();
        const cmd: NewCommand = new NewCommand();
        jest.spyOn(cmd, 'updateSingleLine').mockImplementation(() => {});

        // 1. Success case
        const mockChildSuccess = new EventEmitter() as any;
        mockChildSuccess.stdout = new EventEmitter();
        mockChildSuccess.stderr = new EventEmitter();

        jest.spyOn(child_process, 'exec').mockReturnValue(mockChildSuccess);

        const promiseSuccess = cmd.runNpmInstallWithRealtimeLog('/dummy/dir', '[5/7]');

        // Emit stdout data
        mockChildSuccess.stdout.emit('data', 'added 10 packages\n');
        // Advance timer to trigger spinner tick
        jest.advanceTimersByTime(100);
        expect(cmd.updateSingleLine).toHaveBeenCalledWith('[5/7]', expect.stringContaining('added 10 packages'));

        // Emit stderr data
        mockChildSuccess.stderr.emit('data', 'warn some deprecated package\n');
        jest.advanceTimersByTime(100);

        // Close successfully
        mockChildSuccess.emit('close', 0);
        await expect(promiseSuccess).resolves.toBeUndefined();

        // 2. Failure on close with non-zero code
        const mockChildFail = new EventEmitter() as any;
        mockChildFail.stdout = new EventEmitter();
        mockChildFail.stderr = new EventEmitter();
        (child_process.exec as unknown as jest.Mock).mockReturnValue(mockChildFail);

        const promiseFail = cmd.runNpmInstallWithRealtimeLog('/dummy/dir', '[5/7]');
        mockChildFail.emit('close', 1);
        await expect(promiseFail).rejects.toThrow('npm install failed with exit code 1');

        // 3. Child error event
        const mockChildErr = new EventEmitter() as any;
        mockChildErr.stdout = new EventEmitter();
        mockChildErr.stderr = new EventEmitter();
        (child_process.exec as unknown as jest.Mock).mockReturnValue(mockChildErr);

        const promiseErr = cmd.runNpmInstallWithRealtimeLog('/dummy/dir', '[5/7]');
        mockChildErr.emit('error', new Error('spawn failure'));
        await expect(promiseErr).rejects.toThrow('spawn failure');

        jest.useRealTimers();
    });

    describe('handle() execution flow', () => {
        test('throws error when --force used with current directory .', async () => {
            const cmd: NewCommand = new NewCommand();
            cmd.output = { writeln: jest.fn(), write: jest.fn() };
            cmd.error = jest.fn();
            cmd.info = jest.fn();
            cmd.input = {
                getArgument: jest.fn().mockReturnValue('.'),
                getOption: jest.fn().mockImplementation((opt: string) => opt === 'force')
            };

            await cmd.handle();
            expect(cmd.error).toHaveBeenCalledWith(
                expect.stringContaining('Cannot use --force option when using current directory for installation!')
            );
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('successful install workflow on POSIX system', async () => {
            const cmd: NewCommand = new NewCommand();
            const written: string[] = [];
            cmd.output = {
                writeln: jest.fn((msg: string) => written.push(msg)),
                write: jest.fn((msg: string) => written.push(msg))
            };
            cmd.error = jest.fn();
            cmd.info = jest.fn();
            cmd.input = {
                getArgument: jest.fn().mockReturnValue('my-app'),
                getOption: jest.fn().mockReturnValue(false)
            };

            jest.spyOn(os, 'type').mockReturnValue('Linux');
            jest.spyOn(cmd, 'verifyApplicationDoesntExist').mockImplementation(() => {});
            jest.spyOn(cmd, 'runCommandsSync').mockImplementation((cmds: string[]): string => {
                const cmdStr: string = cmds[0];
                if (cmdStr.includes('npm show @ostro/installer version')) return '1.0.6';
                if (cmdStr.includes('npm ls @ostro/installer -g version')) return '@ostro/installer@1.0.6';
                if (cmdStr.includes('npm v @ostro/ostro dist.tarball')) return 'https://registry.npmjs.org/@ostro/ostro/-/ostro-1.0.0.tgz';
                return '';
            });
            jest.spyOn(cmd, 'runCommandsAsync').mockResolvedValue('ok');
            jest.spyOn(cmd, 'runNpmInstallWithRealtimeLog').mockResolvedValue(undefined);
            jest.spyOn(cmd, 'replaceInFile').mockImplementation(() => {});
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
            jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});

            await cmd.handle();

            expect(cmd.info).toHaveBeenCalledWith('@ostro/installer version verified');
            expect(cmd.info).toHaveBeenCalledWith('Directory created');
            expect(cmd.info).toHaveBeenCalledWith('Application crafted');
            expect(cmd.info).toHaveBeenCalledWith('Environment file generated');
            expect(cmd.info).toHaveBeenCalledWith('Dependencies installed');
            expect(cmd.info).toHaveBeenCalledWith('Key generated');
            expect(cmd.info).toHaveBeenCalledWith('Application setup completed');
            expect(cmd.replaceInFile).toHaveBeenCalled();
            expect(process.exit).not.toHaveBeenCalled();
        });

        test('successful install workflow on Windows_NT with outdated version and --force', async () => {
            const cmd: NewCommand = new NewCommand();
            cmd.output = {
                writeln: jest.fn(),
                write: jest.fn()
            };
            cmd.error = jest.fn();
            cmd.info = jest.fn();
            cmd.input = {
                getArgument: jest.fn().mockReturnValue('custom_proj'),
                getOption: jest.fn().mockImplementation((opt: string) => opt === 'force')
            };

            jest.spyOn(os, 'type').mockReturnValue('Windows_NT');
            jest.spyOn(cmd, 'runCommandsSync').mockImplementation((cmds: string[]): string => {
                const cmdStr: string = cmds[0];
                if (cmdStr.includes('npm show @ostro/installer version')) return '2.0.0';
                if (cmdStr.includes('npm ls @ostro/installer -g version')) return '@ostro/installer@1.0.6';
                if (cmdStr.includes('npm v @ostro/ostro dist.tarball')) return 'https://registry.npmjs.org/@ostro/ostro/-/ostro-1.0.0.tgz';
                return '';
            });
            jest.spyOn(cmd, 'runCommandsAsync').mockResolvedValue('ok');
            jest.spyOn(cmd, 'runNpmInstallWithRealtimeLog').mockResolvedValue(undefined);
            jest.spyOn(cmd, 'replaceInFile').mockImplementation(() => {});
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
            jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
            jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});

            await cmd.handle();

            // Outdated version triggers error notice
            expect(cmd.error).toHaveBeenCalledWith('Update required: "npm install @ostro/installer@latest -g"');
            expect(fs.rmSync).toHaveBeenCalled();
            expect(cmd.info).toHaveBeenCalledWith('Application setup completed');
        });

        test('handles force remove error gracefully during directory creation', async () => {
            const cmd: NewCommand = new NewCommand();
            cmd.output = {
                writeln: jest.fn(),
                write: jest.fn()
            };
            cmd.error = jest.fn();
            cmd.info = jest.fn();
            cmd.input = {
                getArgument: jest.fn().mockReturnValue('my-app'),
                getOption: jest.fn().mockImplementation((opt: string) => opt === 'force')
            };

            jest.spyOn(cmd, 'runCommandsSync').mockImplementation((cmds: string[]): string => {
                const cmdStr: string = cmds[0];
                if (cmdStr.includes('npm show @ostro/installer version')) return '1.0.0';
                if (cmdStr.includes('npm ls @ostro/installer -g version')) return '@ostro/installer@1.0.0';
                if (cmdStr.includes('npm v @ostro/ostro dist.tarball')) return 'https://registry.npmjs.org/tarball.tgz';
                return '';
            });
            jest.spyOn(cmd, 'runCommandsAsync').mockResolvedValue('ok');
            jest.spyOn(cmd, 'runNpmInstallWithRealtimeLog').mockResolvedValue(undefined);
            jest.spyOn(cmd, 'replaceInFile').mockImplementation(() => {});
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
            jest.spyOn(fs, 'rmSync').mockImplementation(() => {
                throw new Error('EPERM error');
            });
            jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});

            await cmd.handle();

            expect(cmd.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'EPERM error' }));
        });

        test('auto-removes created directory when subsequent step fails', async () => {
            const cmd: NewCommand = new NewCommand();
            cmd.output = {
                writeln: jest.fn(),
                write: jest.fn()
            };
            cmd.error = jest.fn();
            cmd.info = jest.fn();
            cmd.input = {
                getArgument: jest.fn().mockReturnValue('failing-app'),
                getOption: jest.fn().mockReturnValue(false)
            };

            jest.spyOn(cmd, 'verifyApplicationDoesntExist').mockImplementation(() => {});
            jest.spyOn(cmd, 'runCommandsSync').mockImplementation((cmds: string[]): string => {
                const cmdStr: string = cmds[0];
                if (cmdStr.includes('npm show @ostro/installer version')) return '1.0.0';
                if (cmdStr.includes('npm ls @ostro/installer -g version')) return '@ostro/installer@1.0.0';
                if (cmdStr.includes('npm v @ostro/ostro dist.tarball')) return 'https://registry.npmjs.org/tarball.tgz';
                return '';
            });
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
            const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
            // Fail during runCommandsAsync (crafting step)
            jest.spyOn(cmd, 'runCommandsAsync').mockRejectedValue(new Error('Crafting failed'));

            await cmd.handle();

            expect(cmd.error).toHaveBeenCalledWith(expect.stringContaining('Installation failed: Crafting failed'));
            expect(rmSyncSpy).toHaveBeenCalled();
            expect(cmd.info).toHaveBeenCalledWith(expect.stringContaining('Auto-removed failed directory'));
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('fails when auto-remove directory itself throws error', async () => {
            const cmd: NewCommand = new NewCommand();
            cmd.output = { writeln: jest.fn(), write: jest.fn() };
            cmd.error = jest.fn();
            cmd.info = jest.fn();
            cmd.input = {
                getArgument: jest.fn().mockReturnValue('failing-app'),
                getOption: jest.fn().mockReturnValue(false)
            };

            jest.spyOn(cmd, 'verifyApplicationDoesntExist').mockImplementation(() => {});
            jest.spyOn(cmd, 'runCommandsSync').mockReturnValue('1.0.0');
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
            jest.spyOn(fs, 'rmSync').mockImplementation(() => {
                throw new Error('rmSync fail');
            });
            jest.spyOn(cmd, 'runCommandsAsync').mockRejectedValue(new Error('Step failed'));

            await cmd.handle();

            expect(cmd.error).toHaveBeenCalledWith(expect.stringContaining('Installation failed: Step failed'));
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('successful install workflow in current directory "." (skips db rename)', async () => {
            const cmd: NewCommand = new NewCommand();
            cmd.output = { writeln: jest.fn(), write: jest.fn() };
            cmd.error = jest.fn();
            cmd.info = jest.fn();
            cmd.input = {
                getArgument: jest.fn().mockReturnValue('.'),
                getOption: jest.fn().mockReturnValue(false)
            };

            jest.spyOn(os, 'type').mockReturnValue('Linux');
            jest.spyOn(cmd, 'verifyApplicationDoesntExist').mockImplementation(() => {});
            // Test falsy fallback for runCommandsSync
            jest.spyOn(cmd, 'runCommandsSync').mockImplementation((cmds: string[]): any => {
                const cmdStr: string = cmds[0];
                if (cmdStr.includes('npm show @ostro/installer version')) return null; // falsy fallback -> ''
                if (cmdStr.includes('npm ls @ostro/installer -g version')) return null; // falsy fallback -> ''
                if (cmdStr.includes('npm v @ostro/ostro dist.tarball')) return 'https://tarball.tgz';
                return '';
            });
            jest.spyOn(cmd, 'runCommandsAsync').mockResolvedValue('ok');
            jest.spyOn(cmd, 'runNpmInstallWithRealtimeLog').mockResolvedValue(undefined);
            jest.spyOn(cmd, 'replaceInFile').mockImplementation(() => {});
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
            jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});

            await cmd.handle();

            expect(cmd.replaceInFile).not.toHaveBeenCalled();
            expect(cmd.info).toHaveBeenCalledWith('Application setup completed');
        });
    });

    test('updateSingleLine uses default 80 columns when process.stdout.columns is undefined', () => {
        const cmd: NewCommand = new NewCommand();
        process.stdout.isTTY = true;
        (process.stdout as { columns?: number }).columns = undefined;

        jest.spyOn(readline, 'clearLine').mockImplementation(() => true);
        jest.spyOn(readline, 'cursorTo').mockImplementation(() => true);

        cmd.updateSingleLine('[1/7]', 'normal length message');
        expect(process.stdout.write).toHaveBeenCalledWith('[1/7] normal length message');
    });

    test('runNpmInstallWithRealtimeLog ignores empty output lines', async () => {
        const cmd: NewCommand = new NewCommand();
        jest.spyOn(cmd, 'updateSingleLine').mockImplementation(() => {});

        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        jest.spyOn(child_process, 'exec').mockReturnValue(mockChild);

        const promise = cmd.runNpmInstallWithRealtimeLog('/dummy/dir', '[5/7]');
        // Emit whitespace and empty lines only
        mockChild.stdout.emit('data', '   \n\n  \n');
        mockChild.emit('close', 0);

        await expect(promise).resolves.toBeUndefined();
    });

    test('verifyApplicationDoesntExist checks file existence as well', () => {
        const cmd: NewCommand = new NewCommand();
        cmd.output = { writeln: jest.fn(), write: jest.fn() };
        cmd.error = jest.fn();

        jest.spyOn(fs, 'statSync').mockReturnValue({
            isDirectory: (): boolean => false,
            isFile: (): boolean => true
        } as fs.Stats);

        cmd.verifyApplicationDoesntExist('/fake/file.txt');
        expect(cmd.error).toHaveBeenCalledWith('Application already exists!');
        expect(process.exit).toHaveBeenCalledWith(1);

        // Neither directory nor file (e.g. socket/fifo)
        (fs.statSync as unknown as jest.Mock).mockReturnValue({
            isDirectory: (): boolean => false,
            isFile: (): boolean => false
        } as fs.Stats);
        (process.exit as unknown as jest.Mock).mockClear();
        cmd.verifyApplicationDoesntExist('/fake/fifo');
        expect(process.exit).not.toHaveBeenCalled();
    });
});
