#!/usr/bin/env python3

import collections
import datetime
import json
import os
import shutil
import subprocess
import sys
from pprint import pprint

import chevron

import logical

dirname = os.path.dirname(__file__)
model_dir = os.path.join(dirname, 'app', 'model')
template_dir = os.path.join(dirname, 'template')
output_dir = os.path.join(dirname, 'created-project')

if len(sys.argv) > 2:
    output_dir = sys.argv[2]
    print(f'Output directory: {output_dir}')


with open(sys.argv[1]) as f:
    config = json.load(f)

internal = {}
with open(os.path.join(model_dir, 'libraries.json')) as f:
    internal.update(json.load(f))
with open(os.path.join(model_dir, 'ui.json')) as f:
    internal.update(json.load(f))

with open(os.path.join(model_dir, 'filelist.json')) as f:
    files_in = json.load(f)

files = {}
filelist = ''

internal['fixups'].append({
    'field': "COPY",
    'fixup': "{COPY.LICENSE$map:licenses}",
    'force': True
})

internal['licenses'] = {}
licenses = internal['dropdowns']['COPY.LICENSE']
for license in licenses:
    internal['licenses'][license] = {}
    internal['licenses'][license][f'use_{license}'] = True

    key = f'licenses/{license}.mustache'

    files[key] = 'LICENSE'
    filelist += logical.compile(key, f'COPY.use_{license}') + '\n'

for key in files_in:
    descr = files_in[key]
    try:
        path = descr['path']
    except KeyError:
        path = None
    try:
        when = descr['when']
    except KeyError:
        when = ""

    if path is None:
        if key.endswith('.mustache'):
            path = key[:-len('.mustache')]
        else:
            path = key

    files[key] = path
    filelist += logical.compile(key, when) + '\n'

data = {}
for listkey in ['switches', 'defaults', 'hidden']:
    thelist = internal[listkey]
    for key in thelist:
        try:
            value = config[key]
        except KeyError:
            value = ''

        if value == '':
            value = thelist[key]

        data[key] = value

maplibs = {}
libs = internal['libs']
for key in libs:
    lib = libs[key]
    try:
        value = config[key]
    except KeyError:
        value = None

    if value is None:
        value = lib['use']

    data[f'use_{key}'] = value
    maplibs[key] = value

for kind in internal['lib_kinds']:
    data[kind] = []

for key in libs:
    if not maplibs[key]:
        continue

    descr = libs[key]
    lib_kind = None
    for kind in internal['lib_kinds']:
        try:
            descr[kind]
            lib_kind = kind
            break
        except KeyError:
            pass

    data[lib_kind].append(descr)

for kind in internal['lib_kinds']:
    data[f'with_{kind}'] = len(data[kind]) > 0


###############################################
# PATCH

def getProp(name): return lambda data: data[name]
def getEmpty(): return lambda data: ''
def emptyFilter(src): return lambda data: src(data)


class mapFilter:
    def __init__(self, src, name, dataset):
        self.src = src
        self.name = name
        self.dataset = dataset

    def __call__(self, data):
        key = self.src(data)
        try:
            return self.dataset[key]
        except KeyError:
            try:
                return self.dataset['']
            except KeyError:
                print(f'Mapping {key} to {self.name} failed')
                return False


class extFilter:
    def __init__(self, src):
        self.src = src

    def __call__(self, data):
        key = self.src(data)
        try:
            return internal['fileext'][key]
        except KeyError:
            return '.h'


filters = {
    'upper': lambda src: lambda data: src(data).upper(),
    'lower': lambda src: lambda data: src(data).lower(),
    'safe': lambda src: lambda data: src(data).replace('-', '_'),
    'year': lambda src: lambda data: str(datetime.date.today().year),
    'h': extFilter
}

for patch in internal['fixups']:
    field = patch['field']
    fixup = patch['fixup']
    try:
        force = patch['force']
    except KeyError:
        force = False

    try:
        if data[field] != '' and not force:
            continue
    except KeyError:
        pass

    fixup = fixup.split('{')
    result = fixup.pop(0)
    for ndx in range(len(fixup)):
        chunk = fixup[ndx]
        ref, verbose = chunk.split('}', 1)
        ref = ref.split('$')

        fixup[ndx] = ref

        ref_name = ref.pop(0)
        code = getEmpty() if ref_name == '' else getProp(ref_name)

        while len(ref):
            fltr = ref.pop(0)
            if fltr.startswith('map:'):
                dataset = fltr[4:]
                try:
                    mapped = internal[dataset]
                except KeyError:
                    mapped = {}
                code = mapFilter(code, dataset, mapped)
            else:
                try:
                    fltr = filters[fltr]
                except KeyError:
                    fltr = emptyFilter
                code = fltr(code)

        if result == '':
            result = code(data)
        else:
            result += code(data)

        if verbose != '':
            result += verbose

    data[field] = result

###############################################
# FOLDING

folded = {}
for key in data:
    value = data[key]
    path = key.split('.')
    if len(path) == 1:
        continue
    ctx = folded
    while len(path) > 1:
        here = path.pop(0)
        if here not in ctx:
            ctx[here] = {}
        ctx = ctx[here]

    ctx[path[0]] = value

###############################################
# MERGING


def merge(dst, src):
    for key in src:
        value = src[key]
        if '.' in key:
            continue
        if key not in dst:
            dst[key] = value
        elif isinstance(value, dict) and isinstance(dst[key], dict):
            merge(dst[key], value)


def unhint(data):
    rem = []
    for key in data:
        if key.endswith('_hint'):
            # del data[key]
            rem.append(key)
            continue
        if isinstance(data[key], dict):
            unhint(data[key])

    for key in rem:
        del data[key]


merge(folded, data)
data = folded
unhint(data)

filelist = chevron.render(template=filelist, data=data).strip().split('\n')

try:
    shutil.rmtree(output_dir)
except FileNotFoundError:
    pass

width = max(map(lambda s: len(s), filelist)) + 2
for tmplt in files:
    if tmplt not in filelist:
        continue
    filename = chevron.render(template=files[tmplt], data=data)
    result = os.path.join(output_dir, filename)

    key = f'[{tmplt}]'
    print(f'{key:<{width}} {filename}')

    with open(os.path.join(template_dir, tmplt)) as f:
        tmplt_text = f.read()
    tmplt_text = chevron.render(template=tmplt_text, data=data) 

    os.makedirs(os.path.dirname(result), exist_ok=True)
    with open(result, "w") as outfile:
        outfile.write(tmplt_text)

with open(os.path.join(dirname, "git.sh.mustache")) as f:
    tmplt_text = f.read()
tmplt_text = chevron.render(template=tmplt_text, data=data) 

os.chdir(output_dir)
for line in filter(lambda ln: len(ln), tmplt_text.split('\n')):
    print()
    print(">>", line)
    subprocess.run(line, shell=True)
