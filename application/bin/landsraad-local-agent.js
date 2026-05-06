#!/usr/bin/env node

let input = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.on('end', () => {
  const packet = parsePacket(input)
  const councilName = packet?.council?.name || 'Unknown Council'
  const jobId = packet?.run?.jobId || 'unknown-job'
  const agentName = packet?.agent?.name || packet?.agent?.id || 'unknown-agent'
  const directorRequest = packet?.request?.directorRequest || 'No director request provided.'
  const retrieved = packet?.context?.retrievedPaths || []

  console.log('# Local CLI Adapter Output')
  console.log('')
  console.log(`Council: ${councilName}`)
  console.log(`Job: ${jobId}`)
  console.log(`Agent: ${agentName}`)
  console.log('')
  console.log('## Director Request')
  console.log('')
  console.log(directorRequest)
  console.log('')
  console.log('## Retrieved Context')
  console.log('')
  if (retrieved.length === 0) {
    console.log('No retrieved context was attached.')
  } else {
    for (const item of retrieved) {
      console.log(`- ${item.filePath}#${item.chunkIndex}`)
    }
  }
})

function parsePacket(text) {
  const match = text.match(/```json\s+([\s\S]*?)```/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}
