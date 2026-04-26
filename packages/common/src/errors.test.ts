import { describe, it, expect } from 'vitest'
import { ApiError } from './errors'

describe('ApiError', () => {
  it('should create an instance with status code and message', () => {
    const error = new ApiError(404, 'Not Found')
    expect(error.statusCode).toBe(404)
    expect(error.message).toBe('Not Found')
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
  })

  it('should capture stack trace', () => {
    const error = new ApiError(500, 'Server Error')
    expect(error.stack).toBeDefined()
  })
})
