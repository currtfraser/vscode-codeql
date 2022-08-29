import 'source-map-support/register';
import 'vscode-test';
import { runTestsInDirectory } from '../index-template';
import 'mocha';
import sinonChai from 'sinon-chai';
import * as chai from 'chai';
import 'chai/register-should';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
chai.use(sinonChai);

export function run(): Promise<void> {
  return runTestsInDirectory(__dirname, true);
}
