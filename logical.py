from pprint import pprint

class Scope:
	def __init__(self, name):
		self.name = name

	def print(self, key, dir):
		tag = '#' if dir else '^'
		return f'{{{{{tag}{self.name}}}}}\n{key}\n{{{{/{self.name}}}}}'

	def __str__(self): return self.name

class NotOper:
	def __init__(self, right):
		self.right = right

	def print(self, key, dir):
		return self.right.print(key, not dir)

	def __str__(self): return f'!{self.right}'

class OrOper:
	def __init__(self, left, right):
		self.left = left
		self.right = right

	def print(self, key, dir):
		true_ = self.left.print(key, dir)
		false_ = self.right.print(key, dir)
		false_ = self.left.print(false_, not dir)
		return f'{true_}\n{false_}'

	def __str__(self): return f'({self.left} || {self.right})'

class AndOper:
	def __init__(self, left, right):
		self.left = left
		self.right = right

	def print(self, key, dir):
		return self.left.print(self.right.print(key, dir), dir)

	def __str__(self): return f'({self.left} && {self.right})'

def split(expr):
	tokens = []
	ndx = 0
	while ndx < len(expr):
		c = expr[ndx]
		ndx += 1
		if c == '|':
			if ndx == len(expr) or expr[ndx] != '|':
				return []
			ndx += 1
			tokens.append('||')
			continue

		if c == '&':
			if ndx == len(expr) or expr[ndx] != '&':
				return []
			ndx += 1
			tokens.append('&&')
			continue
		if c in "!()":
			tokens.append(c)
			continue
		if c in " \t\n":
			continue

		start = ndx - 1
		while ndx < len(expr) and expr[ndx] not in " \t\n()|&!":
			ndx += 1

		stop = ndx
		tokens.append(expr[start:stop])

	return tokens

def getSimple(tokens):
	if not len(tokens): return None
	tok = tokens.pop(0)
	if tok == '!':
		right = getSimple(tokens)
		if not right: return None
		return NotOper(right)

	if tok == '(':
		right = getAnd(tokens)
		if not right: return None
		N = tokens.pop(0)
		if N != ')':
			return None
		return right

	if tok == '&&' or tok == '||':
		return None

	return Scope(tok)

def getOr(tokens):
	left = getSimple(tokens)
	if not left: return None
	if len(tokens) > 0 and tokens[0] == '||':
		tokens.pop(0)
		right = getAnd(tokens)
		if not right: return None
		return OrOper(left, right)

	return left

def getAnd(tokens):
	left = getOr(tokens)
	if not left: return None
	if len(tokens) > 0 and tokens[0] == '&&':
		tokens.pop(0)
		right = getAnd(tokens)
		if not right: return None
		return AndOper(left, right)

	return left

def compile(key, expr):
	tokens = split(expr)
	if not len(tokens):
		return key
	tree = getAnd(tokens)
	return tree.print(key, True)
