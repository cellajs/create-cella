import { describe, expect, it } from 'vitest';
import { isAppSlug } from '../src/answers';

// The template refuses any slug outside this table's rule when it first loads its config
describe('isAppSlug', () => {
  it.each([
    ['my-app', true],
    ['app1', true],
    ['a-b-c-d', true],
    ['cella-e2e-test-1731', true],
    ['abc', false],
    ['a-b-c', false],
    ['my_app', false],
    ['My-app', false],
    ['1app', false],
    ['my--app', false],
    ['-my-app', false],
    ['my-app-', false],
    ['my.app', false],
  ])('%s is %s', (name, valid) => {
    expect(isAppSlug(name)).toBe(valid);
  });
});
