import mustache from './mustache.mjs'
import fixups from './fixups.mjs'
import logical from "./logical.mjs"

const model = {}
let internal = {}

function load(key, orValue, asBool) {
    let value = localStorage.getItem(key)
    if (value === undefined || value === "undefined")
        value = null

    if (value === null)
        value = orValue
    else if (asBool)
        value = value == "1"

    return value
}

function store(key, val) {
    if (typeof val === "boolean")
        val = val ? 1 : 0
    localStorage.setItem(key, val)
}

function getLibraries() {
    return Object.entries(model.libs).map(([key, descr]) => {
        return [key, mustache.render(internal.libname_tmplt, descr), load(key, descr.use, true), descr.use]
    })
}

function getSwitches() {
    return Object.entries(internal.switches).map(([key, defaultValue]) => {
        return [key, key.replaceAll('_', '-'), load(key, defaultValue, true)]
    })
}

function getInputs() {
    return Object.entries(internal.defaults).map(([key, defaultValue]) => {
        if (internal.dropdowns.hasOwnProperty(key))
            return [key, key, load(key, defaultValue, false), internal.dropdowns[key]]
        return [key, key, load(key, defaultValue, false)]
    })
}

function getDefaults() {
    return { libraries: getLibraries(), switches: getSwitches(), inputs: getInputs() }
}

function addSwitches(data, switches) {
    switches.map(([key, value]) => {
        store(key, value)
        data[key] = value
    })
}

function addInputs(data, inputs, minimal) {
    inputs.map(([key, value]) => {
        store(key, value)
        if (value === '') {
            if (!minimal)
                data[key] = internal.defaults[key]
        } else
            data[key] = value
    })
}

function addLibraries(data, libraries, minimal) {
    if (minimal) {
        addSwitches(data, libraries)
        return
    }

    const maplibs = {}
    libraries.map(([key, value]) => {
        store(key, value)
        data[`use_${key}`] = value
        maplibs[key] = value
    })

    for (let kind of internal.lib_kinds) {
        data[kind] = []
    }

    for (let [key, descr] of Object.entries(model.libs)) {
        if (!maplibs[key]) continue

        let lib_kind = null
        for (let kind of internal.lib_kinds) {
            if (descr[kind]) {
                lib_kind = kind
                break
            }
        }
        data[lib_kind].push(descr)
    }

    for (let kind of internal.lib_kinds) {
        data[`with_${kind}`] = data[kind].length > 0
    }
}

function patch(data) {
    for (let patch of internal.fixups) {
        if (patch.force || (data[patch.field] === undefined) || (data[patch.field] === '')) {
            data[patch.field] = patch.fixup(data)
        }
    }
}

function fold(data) {
    let folded = {}
    for (let [key, value] of Object.entries(data)) {
        let path = key.split('.')
        if (path.length == 1) continue
        let ctx = folded
        while (path.length > 1) {
            let here = path.shift()
            if (!ctx.hasOwnProperty(here))
                ctx[here] = {}
            ctx = ctx[here]
        }
        ctx[path[0]] = value
    }
    return folded
}

function merge(dst, src) {
    for (let [key, value] of Object.entries(src)) {
        if (key.indexOf('.') != -1) continue
        if (!dst.hasOwnProperty(key))
            dst[key] = value
        else if (typeof value == "object" &&
                 typeof dst[key] == "object" &&
                 !Array.isArray(value) &&
                 !Array.isArray(dst[key])) {
            merge(dst[key], value)
        }
    }
}

function getJson(libraries, switches, inputs, minimal) {
    let data = {}

    addSwitches(data, switches)
    addInputs(data, inputs, minimal)
    addLibraries(data, libraries, minimal)

    if (minimal) return data

    Object.entries(model.hidden).map(([key, value]) => data[key] = value)

    patch(data)
    let folded = fold(data)
    merge(folded, data)
    return folded
}

async function fetchJson(path) {
    return fetch(path).then(result => result.json())
}

async function loadModel() {
    internal = {}

    let loadInternals = json => {
        let model_props = ['hidden', 'libs']
        for (let info of Object.keys(json)) {
            if (model_props.includes(info)) continue
            internal[info] = json[info]
        }
    
        model.hidden = json.hidden || model.hidden
        model.libs = json.libs || model.libs
    }

    let files = null
    await Promise.all([
        fetchJson('model/filelist.json').then(json => {
            files = json
        }),
        fetchJson('model/ui.json').then(loadInternals),
        fetchJson('model/libraries.json').then(loadInternals),
    ])

    fixups.setFileExts(internal.fileext)
    model.filelist = ''
    model.files = {}

    let licenses = internal.dropdowns['COPY.LICENSE']
    internal.fixups.push({
        field: "COPY",
        fixup: "{COPY.LICENSE$map:licenses}",
        force: true
    })
    internal.licenses = {}
    for (let license of licenses) {
        internal.licenses[license] = {}
        internal.licenses[license][`use_${license}`] = true

        let key = `licenses/${license}.mustache`
        let path = 'LICENSE'
        let when = `COPY.use_${license}`

        model.files[key] = { path: path, tmplt: null }
        model.filelist += logical(key, when) + '\n'
    }

    for (let [key, descr] of Object.entries(files)) {
        descr = descr || {}
        let path = descr.path || null
        let when = descr.when || ""

        if (path == null) {
            if (key.endsWith('.mustache'))
                path = key.substr(0, key.length - '.mustache'.length)
            else
                path = key
        }

        model.files[key] = { path: path, tmplt: null }
        model.filelist += logical(key, when) + '\n'
    }
}

async function loadFiles() {
    fixups.compile(internal.fixups, internal)

    let promises = []
    for (let file of Object.keys(model.files)) {
        promises.push(fetch(`/template/${file}`)
            .then(result => result.text())
            .then(text => {
                model.files[file].tmplt = text
                    .replaceAll('&', '&amp;amp;')
                    .replaceAll('<', '&amp;lt;')
                    .replaceAll('>', '&amp;gt;');
                model.files[file].path = model.files[file].path
                    .replaceAll('&', '&amp;amp;')
                    .replaceAll('<', '&amp;lt;')
                    .replaceAll('>', '&amp;gt;')
            })
        )
    }

    return Promise.all(promises)
}

model.files = null
model.filelist = null
model.libs = null
model.hidden = null
model.loadModel = loadModel
model.loadFiles = loadFiles
model.getJson = getJson
model.getDefaults = getDefaults
export default model
