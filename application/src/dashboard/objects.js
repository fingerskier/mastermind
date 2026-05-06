const OBJECT_TYPES = new Set(['form', 'table', 'chart', 'status-card'])
const FIELD_KINDS = new Set(['text', 'textarea', 'number', 'currency', 'date', 'datetime', 'boolean', 'select'])
const CHART_TYPES = new Set(['line', 'bar'])
const STATUSES = new Set(['ok', 'attention', 'blocked', 'failed', 'done'])

export function validateDashboardObject(value) {
  const errors = []

  if (!isRecord(value)) {
    return result(value, ['Object must be a JSON object.'])
  }

  requireString(value, 'type', errors)
  requireString(value, 'id', errors)
  requireString(value, 'title', errors)

  if (typeof value.type === 'string' && !OBJECT_TYPES.has(value.type)) {
    errors.push(`Unsupported dashboard object type "${value.type}".`)
  }

  if (OBJECT_TYPES.has(value.type)) {
    validateByType(value, errors)
  }

  return result(value, errors)
}

export function normalizeDashboardObjects(input, options = {}) {
  const values = Array.isArray(input) ? input : input === undefined || input === null ? [] : [input]
  return values.map((object, index) => {
    const validation = validateDashboardObject(object)
    return {
      sourcePath: options.sourcePath || null,
      index,
      object,
      valid: validation.valid,
      errors: validation.errors,
      renderer: validation.valid ? object.type : 'json',
    }
  })
}

export function extractDashboardObjectsFromText(text, options = {}) {
  if (!text) return []

  const extracted = []
  const fencePattern = /```(?:json|dashboard-object|dashboard-objects)\s*([\s\S]*?)```/gi
  let match
  while ((match = fencePattern.exec(text)) !== null) {
    const parsed = parseJson(match[1])
    if (parsed === undefined) continue
    const values = Array.isArray(parsed) ? parsed : [parsed]
    for (const value of values) {
      if (isRecord(value) && typeof value.type === 'string') extracted.push(value)
    }
  }

  return normalizeDashboardObjects(extracted, options)
}

function validateByType(value, errors) {
  if (value.type === 'form') validateForm(value, errors)
  if (value.type === 'table') validateTable(value, errors)
  if (value.type === 'chart') validateChart(value, errors)
  if (value.type === 'status-card') validateStatusCard(value, errors)
}

function validateForm(value, errors) {
  if (value.submitLabel !== undefined && typeof value.submitLabel !== 'string') {
    errors.push('Form submitLabel must be a string when present.')
  }

  if (!Array.isArray(value.fields) || value.fields.length === 0) {
    errors.push('Form fields must be a non-empty array.')
    return
  }

  value.fields.forEach((field, index) => {
    if (!isRecord(field)) {
      errors.push(`Form field ${index} must be an object.`)
      return
    }

    requireString(field, 'id', errors, `Form field ${index}`)
    requireString(field, 'label', errors, `Form field ${index}`)
    requireString(field, 'kind', errors, `Form field ${index}`)

    if (typeof field.kind === 'string' && !FIELD_KINDS.has(field.kind)) {
      errors.push(`Form field ${index} has unsupported kind "${field.kind}".`)
    }

    if (field.required !== undefined && typeof field.required !== 'boolean') {
      errors.push(`Form field ${index} required must be boolean when present.`)
    }

    if (field.kind === 'select' && field.options !== undefined && !Array.isArray(field.options)) {
      errors.push(`Form field ${index} select options must be an array when present.`)
    }
  })
}

function validateTable(value, errors) {
  if (!Array.isArray(value.columns) || value.columns.length === 0) {
    errors.push('Table columns must be a non-empty array.')
  } else {
    value.columns.forEach((column, index) => {
      if (!isRecord(column)) {
        errors.push(`Table column ${index} must be an object.`)
        return
      }
      requireString(column, 'id', errors, `Table column ${index}`)
      requireString(column, 'label', errors, `Table column ${index}`)
    })
  }

  if (!Array.isArray(value.rows)) {
    errors.push('Table rows must be an array.')
  } else if (!value.rows.every(isRecord)) {
    errors.push('Every table row must be an object.')
  }
}

function validateChart(value, errors) {
  requireString(value, 'chartType', errors)
  requireString(value, 'x', errors)
  requireString(value, 'y', errors)

  if (typeof value.chartType === 'string' && !CHART_TYPES.has(value.chartType)) {
    errors.push(`Unsupported chart type "${value.chartType}".`)
  }

  if (!Array.isArray(value.data)) {
    errors.push('Chart data must be an array.')
    return
  }

  value.data.forEach((row, index) => {
    if (!isRecord(row)) {
      errors.push(`Chart row ${index} must be an object.`)
      return
    }
    if (typeof value.x === 'string' && !(value.x in row)) {
      errors.push(`Chart row ${index} is missing x field "${value.x}".`)
    }
    if (typeof value.y === 'string' && typeof row[value.y] !== 'number') {
      errors.push(`Chart row ${index} y field "${value.y}" must be numeric.`)
    }
  })
}

function validateStatusCard(value, errors) {
  requireString(value, 'status', errors)
  if (typeof value.status === 'string' && !STATUSES.has(value.status)) {
    errors.push(`Unsupported status "${value.status}".`)
  }
  if (value.summary !== undefined && typeof value.summary !== 'string') {
    errors.push('Status card summary must be a string when present.')
  }
}

function requireString(value, key, errors, prefix = null) {
  if (typeof value[key] !== 'string' || value[key].trim() === '') {
    errors.push(`${prefix ? `${prefix} ` : ''}${key} must be a non-empty string.`)
  }
}

function result(object, errors) {
  return {
    object,
    valid: errors.length === 0,
    errors,
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
