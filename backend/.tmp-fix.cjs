const fs = require('fs')
let s = fs.readFileSync('translate.js', 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing ' + a.slice(0, 50)); s = s.replace(a, () => b) }
rep("  'branza de vaci': ['творог', 'cottage cheese'],\n", "  'branza de vaci': ['творог', 'cottage cheese'],\n  'branza telemea': ['брынза', 'telemea cheese'],\n  telemea: ['брынза', 'telemea cheese'],\n")
rep("  const re = /[\"“„«]([^\"”»]+)[\"”»]|(\d+(?:[.,]\d+)?)\s*(kg|ml|gr|g|l|pl|buc)\b|(\S+)/gi",
    "  const re = /[\"“„«]([^\"”»]+)[\"”»]|(\d+(?:[.,]\d+)?)\s*(kg|ml|gr|g|l|pl|buc)\b|(\d+(?:[.,]\d+)?%?)(?=\s|$)|(\S+)/gi")
rep("    } else {\n      const word = m[4]", "    } else if (m[4]) {\n      segments.push({ type: 'number', value: m[4] })\n    } else {\n      const word = m[5]")
rep("    if (last && s.type === last.type && s.type !== 'unit')", "    if (last && s.type === last.type && s.type !== 'unit' && s.type !== 'number')")
rep("    } else if (s.type === 'unit') {", "    } else if (s.type === 'number') {\n      parts.push(lang === 'ru' ? s.value.replace('.', ',') : s.value.replace(',', '.'))\n    } else if (s.type === 'unit') {")
fs.writeFileSync('translate.js', s)
