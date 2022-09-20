import * as path from 'path';
import * as tmp from 'tmp';
import * as fs from 'fs-extra';
import fetch from 'node-fetch';

import { fail } from 'assert';
import { commands, ConfigurationTarget, extensions, workspace } from 'vscode';
import { CodeQLExtensionInterface } from '../../extension';
import { DatabaseManager } from '../../databases';

// This file contains helpers shared between actual tests.

export const DB_URL = 'https://github.com/github/vscode-codeql/files/5586722/simple-db.zip';

process.addListener('unhandledRejection', (reason) => {
  if (reason instanceof Error && reason.message === 'Canceled') {
    console.log('Cancellation requested after the test has ended.');
    process.exit(0);
  } else {
    fail(String(reason));
  }
});

// We need to resolve the path, but the final three segments won't exist until later, so we only resolve the
// first portion of the path.
export const dbLoc = path.join(
  fs.realpathSync(path.join(__dirname, '../../../')),
  'build/tests/db.zip'
);
export let storagePath: string;

export default function (mocha: Mocha) {
  // create an extension storage location
  let removeStorage: tmp.DirResult['removeCallback'] | undefined;

  // ensure the test database is downloaded
  (mocha.options as any).globalSetup.push(async () => {
    fs.mkdirpSync(path.dirname(dbLoc));
    if (!fs.existsSync(dbLoc)) {
      try {
        await new Promise((resolve, reject) => {
          return fetch(DB_URL).then((response) => {
            const dest = fs.createWriteStream(dbLoc);
            response.body.pipe(dest);

            response.body.on('error', reject);
            dest.on('error', reject);
            dest.on('close', () => {
              resolve(dbLoc);
            });
          });
        });
      } catch (e) {
        fail('Failed to download test database: ' + e);
      }
    }
  });

  // Set the CLI version here before activation to ensure we don't accidentally try to download a cli
  (mocha.options as any).globalSetup.push(async () => {
    await workspace
      .getConfiguration()
      .update('codeQL.cli.executablePath', process.env.CLI_PATH, ConfigurationTarget.Global);
  });

  // Create the temp directory to be used as extension local storage.
  (mocha.options as any).globalSetup.push(() => {
    const dir = tmp.dirSync();
    storagePath = fs.realpathSync(dir.name);
    if (storagePath.substring(0, 2).match(/[A-Z]:/)) {
      storagePath = storagePath.substring(0, 1).toLocaleLowerCase() + storagePath.substring(1);
    }

    removeStorage = dir.removeCallback;
  });

  // ensure extension is cleaned up.
  (mocha.options as any).globalTeardown.push(async () => {
    const extension = await extensions
      .getExtension<CodeQLExtensionInterface | Record<string, never>>('GitHub.vscode-codeql')!
      .activate();
    // This shuts down the extension and can only be run after all tests have completed.
    // If this is not called, then the test process will hang.
    if ('dispose' in extension) {
      extension.dispose();
    }
  });

  // ensure temp directory is cleaned up.
  (mocha.options as any).globalTeardown.push(() => {
    removeStorage?.();
  });

  // check that the codeql folder is found in the workspace
  (mocha.options as any).globalSetup.push(async () => {
    const folders = workspace.workspaceFolders;
    if (!folders) {
      fail(
        '\n\n\nNo workspace folders found.\nYou will need a local copy of the codeql repo.\nMake sure you specify the path to it in launch.json.\nIt should be something along the lines of "${workspaceRoot}/../codeql" depending on where you have your local copy of the codeql repo.\n\n\n'
      );
    } else {
      const codeqlFolder = folders.find((folder) => folder.name === 'codeql');
      if (!codeqlFolder) {
        fail(
          '\n\n\nNo workspace folders found.\nYou will need a local copy of the codeql repo.\nMake sure you specify the path to it in launch.json.\nIt should be something along the lines of "${workspaceRoot}/../codeql" depending on where you have your local copy of the codeql repo.\n\n\n'
        );
      }
    }
  });
}

export async function cleanDatabases(databaseManager: DatabaseManager) {
  for (const item of databaseManager.databaseItems) {
    await commands.executeCommand('codeQLDatabases.removeDatabase', item);
  }
}
