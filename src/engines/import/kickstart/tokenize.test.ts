// src/engines/import/kickstart/tokenize.test.ts
import { describe, expect, it } from 'vitest'
import { tokenizeKickstart } from './tokenize'

describe('tokenizeKickstart', () => {
  it('joins trailing-backslash line continuations into one command', () => {
    const nodes = tokenizeKickstart('network --bootproto=static \\\n  --ip=10.0.0.5\n')
    const cmd = nodes.find((n) => n.kind === 'command')
    expect(cmd).toMatchObject({
      kind: 'command',
      name: 'network',
      args: '--bootproto=static --ip=10.0.0.5',
    })
  })

  it('assigns per-command occurrence indices', () => {
    const nodes = tokenizeKickstart('network --device=eth0\nnetwork --device=eth1\n')
    const nets = nodes.filter((n) => n.kind === 'command' && n.name === 'network')
    expect(nets.map((n) => (n as { index: number }).index)).toEqual([0, 1])
  })

  it('captures a section body until %end', () => {
    const nodes = tokenizeKickstart('%packages\n@core\nvim\n%end\n')
    expect(nodes.find((n) => n.kind === 'section')).toMatchObject({
      kind: 'section',
      header: '%packages',
      body: '@core\nvim',
    })
  })

  it('classifies comments and blanks', () => {
    const nodes = tokenizeKickstart('# hello\n\nlang en_US.UTF-8\n')
    expect(nodes[0]).toEqual({ kind: 'comment', raw: '# hello' })
    expect(nodes[1]).toEqual({ kind: 'blank' })
  })

  it('preserves leading indentation in section bodies (no trim)', () => {
    const nodes = tokenizeKickstart('%post\n  if true; then\n    echo nested\n  fi\n%end\n')
    expect(nodes.find((n) => n.kind === 'section')).toMatchObject({
      kind: 'section',
      header: '%post',
      body: '  if true; then\n    echo nested\n  fi',
    })
  })
})
