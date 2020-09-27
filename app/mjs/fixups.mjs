function getProp(name) { return data => data[name] }
function getEmpty() { return data => '' }
function getDirect(text) { return data => text }
function emptyFilter(src) { return data => src(data) }
function mapFilter(src, name, dataset) {
    return data => {
        let key = src(data)
        let result = dataset[key] || dataset['']
        if (result === undefined) {
            console.warn(`Mapping ${key} to ${name} failed`)
        }
        return result || false
    }
}

let fileext = null

function setFileExts(items) {
    fileext = {}
    for (let [key, value] of Object.entries(items)) {
        fileext[key] = value
    }

    fileext['{{EXT.cxx}}'] = '{{EXT.hxx}}'
}

function isoPlus() {
    function pad(number) {
        if (number < 10) {
          return '0' + number;
        }
        return number;
      }

    let now = new Date()
    let offset = now.getTimezoneOffset()
    let char = offset < 0 ? '+' : '-'
    if (offset < 0) offset = -offset
    let mins = offset % 60
    let hours = (offset - mins) / 60
    offset = `${char}${pad(hours)}${pad(mins)}`
    // YEAR-MO-DA HO:MI+ZONE
    let main = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getSeconds())}${offset}`

    return main
}
const filters = {
    upper: src => (data => src(data).toUpperCase()),
    lower: src => (data => src(data).toLowerCase()),
    safe: src => (data => src(data).replaceAll('-', '_')),
    year: src => (data => new Date().getFullYear() + ''),
    now: src => (data => isoPlus()),
    h: src => (data => fileext[src(data)] || '.h')
}

function compileFixup(program) {
    return data => {
        let result = program.map(code => code(data))
        if (result.length == 1) return result[0]
        return result.join('')
    }
}

function compile(fixups, datasets) {
    for (let patch of fixups) {
        const chunks = patch.fixup.split('{')
        let program = []

        const first = chunks.shift()
        if (first !== '')
            program.push(getDirect(first))

        for (let chunk of chunks) {
            let ref = chunk.split('}', 1)[0]
            const verbose = chunk.substr(ref.length + 1)
            ref = ref.split('$')
            let ref_name = ref.shift()
            let code = ref_name === '' ? getEmpty() : getProp(ref_name)
            while (ref.length) {
                let filter = ref.shift()
                if (filter.startsWith('map:')) {
                    let dataset = filter.substr(4)
                    code = mapFilter(code, dataset, datasets[dataset] || {})
                } else {
                    code = (filters[filter] || emptyFilter)(code)
                }
            }
            program.push(code)
            if (verbose !== '')
                program.push(getDirect(verbose))
        }

        patch.fixup = compileFixup(program)
    }
}

export default { compile, setFileExts }
