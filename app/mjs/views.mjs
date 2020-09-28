import mustache from './mustache.mjs';
import model from './model.mjs';

let minimalJSON = true

Element.prototype.with = function(...nodesOrDOMStrings) {
    this.append(...nodesOrDOMStrings)
    return this
}

function $(id) { return document.getElementById(id); }

function toId(file) { return `file--${file}` }
function toSelector(file) {
    return `#${toId(file)}`
        .replaceAll('/', '\\/')
        .replaceAll('.', '\\.')
}

function E(name, attrs) {
    let elem = document.createElement(name)
    attrs = attrs || {}
    for (let attr of Object.keys(attrs)) {
        elem.setAttribute(attr, attrs[attr])
    }
    return elem
}

function label(id, text) {
    let _label = E('label', { for: id})
    _label.innerHTML = text
    _label.append(':')
    return _label
}

function createSwitches(values) {
    let root = E('div', {'class': 'inputs'})

    for (let [id, text, value] of values) {
        const input = E('input', {id: id, type: 'checkbox'})
        input.checked = value
        input.addEventListener('input', renderFiles)

        root.append(E('div', {'class': 'input'}).with(
            label(id, text),
            input
        ))
    }

    return root
}

function createInputs(values) {
    let root = E('div', {'class': 'inputs'})

    for (let decl of values) {
        let [id, text, value] = decl
        const input = E('input', {id: id, value: value})
        input.addEventListener('input', renderFiles)

        const children = [label(id, text), input]

        if (decl.length > 3) {
            children.push(E('datalist', {id: id + '--datalist'}).with(
                ...decl[3].map(name => E('option', {value: name}))
            ))
            input.setAttribute('list', id + '--datalist')
        }

        root.append(E('div', {'class': 'input'}).with(
            ...children
        ))
    }

    return root
}

function createForm(selector) {
    const {libraries, switches, inputs} = model.getDefaults()

    document.querySelector(selector).append(
        E('form').with(
            E('div', {'class': 'form'}).with(
                createSwitches(libraries.slice(0, (libraries.length + 1) / 2)),
                createSwitches(libraries.slice((libraries.length + 1) / 2)),
                createSwitches(switches),
                createInputs(inputs.slice(0, (inputs.length + 1) / 2)),
                createInputs(inputs.slice((inputs.length + 1) / 2))
            )
        )
    )
}

function minimalChanged() {
    minimalJSON = $('mustache--context--minimal').checked
    renderFiles()
}

function saveJSON() {
    var file

    let text = document.querySelector('#mustache--context > pre > code').innerText
    let properties = { type: 'application/json' }
    try {
        file = new File([ text ], 'config.json', properties)
    } catch(e) {
        file = new Blob([ text ], properties)
    }
    let url = URL.createObjectURL(file)
    let anchor = E('a', { href: url, download: 'config.json'})
    anchor.click()
}

function createViewers(selector) {
    let minimalSwitch = E('input', {type: 'checkbox', id: 'mustache--context--minimal', checked: minimalJSON})
    minimalSwitch.addEventListener('input', minimalChanged)
    let JSONSave = E('button', {id: 'mustache--context--save', style: 'float: right; font-family: Ubuntu'}).with('Save')
    JSONSave.addEventListener('click', saveJSON)

    let keys = Object.keys(model.files)
    keys.sort()
    document.querySelector(selector).append(
        E('div', {id: 'filelist', 'class': 'root'}).with(
            E('div', {'class': 'filenames'}).with(
                E('div', {id: 'filelist-path', 'class': 'path'}).with('File list:')
            ),
            E('pre').with(E('code'))
        ),
        ...keys.map((file) => {
            let id = `file--${file}`
        
            return E('div', {id: id, 'class': 'root'}).with(
                E('div', {'class': 'filenames'}).with(
                    E('div', {id: id + '--path', 'class': 'path'}),
                    E('div', {id: id + '--tmplt', 'class': 'file'})
                ),
                E('pre').with(E('code'))
            )
        }),
        E('div', {id: 'mustache--context', 'class': 'root'}).with(
            E('div', {'class': 'filenames'}).with(
                E('div', {id: 'mustache--context-path', 'class': 'path', style: 'position: relative; display: block'}).with(
                    'Mustache context:\u00A0',
                    E('label', {'class': 'switch'}).with(
                        E('code').with(' '),
                        minimalSwitch,
                        E('code').with(' minimal JSON')
                    ),
                    '\u00a0',
                    JSONSave
                )
            ),
            E('pre').with(E('code'))
        )
    )
}

var thinner = text => {
    let text2 = `${text}`
        .replaceAll('&lt;', '<')
        .replaceAll('&#x2F;', '/')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
    return text2
}

var strong = text => {
    text = `${text}`
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')

    return `<strong>${text}</strong>`
}

function render(file, data) {
    let id = toSelector(file)
    let outfile = model.files[file].path
    let tmplt = model.files[file].tmplt

    let div = document.querySelector(id)
    div.querySelector(`${id}--tmplt`).innerHTML = `<code>${file}</code>`
    div.querySelector(`${id}--path`).innerHTML = `<code>${thinner(mustache.render(outfile, data))}</code>`
    div.querySelector('pre > code').innerHTML = thinner(mustache.render(tmplt, data))
}

var objectToString = Object.prototype.toString;
var isArray = Array.isArray || function isArrayPolyfill (object) {
  return objectToString.call(object) === '[object Array]';
};

function embolden(data) {
    if (isArray(data)) {
        let result = []
        for (let elem of data) {
            result.push(embolden(elem))
        }
        return result
    }

    if (typeof data == "string")
        return strong(data)

    if (typeof data == "object") {
        let result = {}
        for (let key of Object.keys(data)) {
            if (model.hidden.hasOwnProperty(key)) {
                result[key] = data[key]
                continue
            }

            result[key] = embolden(data[key])
        }
        return result    
    }
    
    if (typeof data != "boolean") {
        console.log(data, typeof data)
    }
    return data
}

function setObjHints(prefix, ctx) {
    let removed = []
    for (let [key, value] of Object.entries(ctx)) {
        if (key.endsWith('_hint')) {
            removed.push(key)
            continue
        }
        let alt = ctx[`${prefix}${key}_hint`] || value
        if (typeof alt === "string") {
            let elem = document.getElementById(`${prefix}${key}`)
            if (elem)
                elem.setAttribute('placeholder', alt.replaceAll('\t', '\\t'))
        }

        if (!isArray(value) && typeof value === "object") {
            let new_prefix = `${prefix}${key}.`
            setObjHints(new_prefix, value)
        }
    }

    for (let key of removed) {
        delete ctx[key]
    }
}

function setHints(data) {
    setObjHints('', data)
}

function showContext(data) {
    $('mustache--context').querySelector('pre > code').innerText = JSON.stringify(data, null, '    ')
}


function relinkFilelist(data) {
    const filelist = document.querySelector('#filelist > pre > code');

    filelist.innerHTML = thinner(mustache.render(model.filelist, data))
    let file_list = filelist.innerText

    if (file_list.length && file_list[file_list.length-1] != '\n')
        file_list += '\n'
    file_list += 'filelist'
    const visible = [...file_list.split('\n')]
    for (let file of Object.keys(model.files)) {
        let elem = document.getElementById(toId(file))
        if (visible.includes(file))
            elem.classList.remove('hidden')
        else
            elem.classList.add('hidden')

    }
    filelist.innerHTML = ''

    let links = ''
    let list = visible.splice(0, visible.length - 1)
    list.sort()
    for (let file of list) {
        let outfile = model.files[file].path
        let id = toId(file)
        links += `<code><a href='#${id}'>${thinner(mustache.render(outfile, data))}</a></code>\n`
    }
    filelist.innerHTML = links
}

function renderFiles() {
    const { libraries, switches, inputs} = model.getDefaults()

    let data = model.getJson(
        libraries.map(elem => [elem[0], $(elem[0]).checked]),
        switches.map(elem => [elem[0], $(elem[0]).checked]),
        inputs.map(elem => [elem[0], $(elem[0]).value]),
        false
    )

    let context = model.getJson(
        libraries.map(elem => [elem[0], $(elem[0]).checked]),
        switches.map(elem => [elem[0], $(elem[0]).checked]),
        inputs.map(elem => [elem[0], $(elem[0]).value]),
        minimalJSON
    )

    setHints(data)
    showContext(context)

    data = embolden(data)

    for (let file of Object.keys(model.files)) {
        try{
            render(file, data)
        } catch(ex) {
            console.log(model.files[file])
            throw ex;
        }
    }

    relinkFilelist(data)
}

export default {createForm, createViewers, renderFiles}
