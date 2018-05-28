const { URL } = require('url')
const { inspect } = require('util')
const TRAILING_SLASH = /\/$/
let compiledRegexes = {}

exports.handler = createHandler(require('../rules.json')) // expose to lambda
exports.createHandler = createHandler // expose for testing

function createHandler (rules) {
  return async function (event) {
    const request = event.Records[0].cf.request
    const cleanPath = stripTrailingSlash(request.uri.toLowerCase())
    log(event)

    for (const rule of rules) {
      let newPath = null

      if (rule.regex) {
        if (!compiledRegexes.hasOwnProperty(rule.pattern)) {
          compiledRegexes[rule.pattern] = new RegExp(rule.pattern)
        }

        const regex = compiledRegexes[rule.pattern]
        if (regex.test(cleanPath)) {
          newPath = cleanPath.replace(regex, rule.replacement)
        }
      } else if (cleanPath === rule.pattern) {
        newPath = rule.replacement
      }

      if (newPath !== null) {
        if (rule.type === 'rewrite') {
          request.uri = newPath || '/'
          if (rule.origin) setOrigin(request, rule.origin)
          log(request)
          return request
        } else {
          const response = createRedirect(newPath)
          log(response)
          return response
        }
      }
    }

    // If no matches, return unmodified request
    log('no match')
    return request
  }
}

// Mutates request object
function setOrigin (request, origin) {
  const url = new URL(origin)
  const protocol = url.protocol.slice(0, -1) // remove trailing colon
  const path = stripTrailingSlash(url.pathname)

  request.origin = {
    custom: {
      domainName: url.hostname,
      protocol,
      port: (protocol === 'https') ? 443 : 80,
      path,
      sslProtocols: ['TLSv1.2', 'TLSv1.1'],
      readTimeout: 5,
      keepaliveTimeout: 5,
      customHeaders: {}
    }
  }
  request.headers.host = [
    { key: 'host', value: url.hostname }
  ]
}

function createRedirect (newUri) {
  return {
    status: '301',
    statusDescription: 'Moved Permanently',
    headers: {
      location: [
        { key: 'Location', value: newUri }
      ]
    }
  }
}

function log (data) {
  if (process.env.NODE_ENV === 'test') return
  // use util.inspect so objects aren't collapsed
  console.log(inspect(data, false, 10))
}

function stripTrailingSlash (path) {
  if (path === '/') return path
  else return path.replace(TRAILING_SLASH, '')
}
