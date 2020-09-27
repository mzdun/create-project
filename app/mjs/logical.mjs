class Scope {
    constructor(name) {
        this.name = name
    }

    print(key, dir) {
        let tag = dir ? '#' : '^'
        return `{{${tag}${this.name}}}\n${key}\n{{/${this.name}}}`
    }

    toString() { return this.name }
}

class NotOper  {
    constructor(right) {
        this.right = right
     }

    print(key, dir) {
        return this.right.print(key, !dir)
    }

    toString() { return `!${this.right}` }
}

class OrOper  {
    constructor(left, right) {
        this.left = left
        this.right = right
    }

    print(key, dir) {
        let true_ = this.left.print(key, dir)
        let false_ = this.right.print(key, dir)
        false_ = this.left.print(false_, !dir)
        return `${true_}\n${false_}`
    }

    toString() { return `(${this.left} || ${this.right})` }
}

class AndOper  {
    constructor(left, right) {
        this.left = left
        this.right = right
    }

    print(key, dir) {
        return this.left.print(this.right.print(key, dir), dir)
    }

    toString() { return `(${this.left} && ${this.right})` }
}

function split(expr) {
    let tokens = []
    let ndx = 0
    while(ndx < expr.length) {
        let c = expr[ndx++]
        switch(c) {
        case '|':
            if (ndx == expr.length || expr[ndx] != '|')
                return []
            ++ndx;
            tokens.push('||')
            break;
        case '&':
            if (ndx == expr.length || expr[ndx] != '&')
                return []
            ++ndx;
            tokens.push('&&')
            break;
        case '!': case '(': case ')':
            tokens.push(c)
            break;
        case ' ': case '\t':case '\n':
            break
        default:
            let start = ndx - 1;
            while (ndx < expr.length && " \t\n()|&!".indexOf(expr[ndx]) == -1) {
                ++ndx;
            }
            let stop = ndx;
            tokens.push(expr.substring(start, stop))
        }
    }
    return tokens
}

function getSimple(tokens) {
    if (!tokens.length) return null;
    let tok = tokens.shift()
    if (tok == '!') {
        let right = getSimple(tokens)
        if (!right) return null
        return new NotOper(right)
    }

    if (tok == '(') {
        let right = getAnd(tokens)
        if (!right) return null
        let next = tokens.shift()
        if (next != ')')
            return null
        return right
    }

    if (tok == '&&' || tok == '||')
        return null
 
    return new Scope(tok)
}

function getOr(tokens) {
    let left = getSimple(tokens)
    if (!left) return null
    if (tokens.length > 0 && tokens[0] == '||') {
        tokens.shift()
        let right = getAnd(tokens)
        return new OrOper(left, right)
    }
    return left
}

function getAnd(tokens) {
    let left = getOr(tokens)
    if (!left) return null
    if (tokens.length > 0 && tokens[0] == '&&') {
        tokens.shift()
        let right = getAnd(tokens)
        return new AndOper(left, right)
    }
    return left
}

function compile(key, expr) {
    let tokens = split(expr)
    if (tokens.length == 0)
        return key
    let tree = getAnd(tokens)
    return tree.print(key, true)
}

export default compile
