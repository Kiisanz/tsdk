import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseProjectYaml, ProjectValidationError } from '../project/parser.js';

describe('Project Manifest (.tsproj) Parser', () => {
  it('parses valid .tsproj manifest successfully', () => {
    const yaml = `
schemaVersion: 1
kind: Project

metadata:
  name: Acme.Api
  version: 1.0.0

spec:
  type: webapi
  runtime: node

  package:
    name: "@acme/api"
    private: true

  source:
    root: src
    entry: src/main.ts

  compiler:
    target: ES2022
    module: NodeNext
    strict: true

  references:
    - project: Acme.Domain
`;
    const manifest = parseProjectYaml(yaml, 'Acme.Api.tsproj');

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.kind, 'Project');
    assert.equal(manifest.metadata.name, 'Acme.Api');
    assert.equal(manifest.metadata.version, '1.0.0');
    assert.equal(manifest.spec.type, 'webapi');
    assert.equal(manifest.spec.runtime, 'node');
    assert.equal(manifest.spec.package?.name, '@acme/api');
    assert.equal(manifest.spec.references?.length, 1);
    assert.equal(manifest.spec.references?.[0].project, 'Acme.Domain');
  });

  it('rejects invalid schemaVersion', () => {
    const yaml = `
schemaVersion: 2
kind: Project
metadata:
  name: Foo
spec:
  type: library
`;
    assert.throws(
      () => parseProjectYaml(yaml),
      (err: unknown) => err instanceof ProjectValidationError && err.message.includes('schemaVersion'),
    );
  });

  it('rejects invalid kind', () => {
    const yaml = `
schemaVersion: 1
kind: Workspace
metadata:
  name: Foo
spec:
  type: library
`;
    assert.throws(
      () => parseProjectYaml(yaml),
      (err: unknown) => err instanceof ProjectValidationError && err.message.includes('kind'),
    );
  });

  it('rejects missing metadata.name', () => {
    const yaml = `
schemaVersion: 1
kind: Project
metadata:
  version: 1.0.0
spec:
  type: library
`;
    assert.throws(
      () => parseProjectYaml(yaml),
      (err: unknown) => err instanceof ProjectValidationError && err.message.includes('metadata.name'),
    );
  });

  it('rejects invalid spec.type', () => {
    const yaml = `
schemaVersion: 1
kind: Project
metadata:
  name: Foo
spec:
  type: invalid_type
`;
    assert.throws(
      () => parseProjectYaml(yaml),
      (err: unknown) => err instanceof ProjectValidationError && err.message.includes('spec.type'),
    );
  });

  it('rejects self-reference', () => {
    const yaml = `
schemaVersion: 1
kind: Project
metadata:
  name: Acme.Api
spec:
  type: webapi
  references:
    - project: Acme.Api
`;
    assert.throws(
      () => parseProjectYaml(yaml),
      (err: unknown) => err instanceof ProjectValidationError && err.message.includes('cannot reference itself'),
    );
  });

  it('rejects duplicate references', () => {
    const yaml = `
schemaVersion: 1
kind: Project
metadata:
  name: Acme.Api
spec:
  type: webapi
  references:
    - project: Acme.Domain
    - project: Acme.Domain
`;
    assert.throws(
      () => parseProjectYaml(yaml),
      (err: unknown) => err instanceof ProjectValidationError && err.message.includes('Duplicate reference'),
    );
  });
});
