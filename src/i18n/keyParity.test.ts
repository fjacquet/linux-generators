import { describe, expect, it } from 'vitest'
import { resources, SUPPORTED_LANGUAGES } from './index'

const flatKeys = (obj: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )

describe('i18n key parity', () => {
  const enKeys = flatKeys(resources.en.common).sort()

  it.each(SUPPORTED_LANGUAGES.filter((l) => l !== 'en'))(
    '%s defines exactly the same keys as en',
    (lng) => {
      const keys = flatKeys(resources[lng].common).sort()
      expect(keys).toEqual(enKeys)
    },
  )
})
