const assert = require('node:assert/strict')
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { after, before, test } = require('node:test')
const { CustomLists, CustomList, customListDependsOn, simplifiedName } = require('../cjs/custom-list.js')
const { Confirm } = require('@itrocks/confirm')
const { dataPath, setDataPath } = require('@itrocks/data-path')

let directory
const owner = { id: '42', name: 'Alice' }
const other = { id: '43', name: 'Bob' }
const state = { columns: ['title'], filter: { title: 'Alien', hidden: '!empty' }, sort: [['title', true]] }
class TestRequest
{
	constructor()
	{
		this.request = { data: {}, headers: {}, method: 'POST', path: '/movie/custom-list',
			session: { current: structuredClone(state) } }
	}
	get data() { return this.request.data }
	set data(value) { this.request.data = value }
}
const request = () => new TestRequest()
const context = user => ({ defaultName: 'Films', key: '/movie', modulePath: 'app/movie', user })
const lists = user => new CustomLists(context(user), directory)

before(async () => {
	directory = await mkdtemp(join(tmpdir(), 'custom-lists-'))
	customListDependsOn({
		context: async request => context(request.request.session.user),
		state: {
			read: request => structuredClone(request.request.session.current),
			replace: (request, value) => { request.request.session.current = structuredClone(value ?? {}) }
		}
	})
})
after(async () => { await rm(directory, { force: true, recursive: true }) })

test('names are simplified for identity while JSON retains the exact label and applied state', async () => {
	assert.equal(simplifiedName('  Films prêtés ! '), 'films-pretes')
	const current = request()
	await lists(owner).save(current, '  Films prêtés ! ', 'private')
	const saved = JSON.parse(await readFile(join(directory, 'app/movie/films-pretes-42.json'), 'utf8'))
	assert.equal(saved.name, '  Films prêtés ! ')
	assert.deepEqual(saved.owner, owner)
	assert.deepEqual(saved.state, state)
	assert.deepEqual(await lists(owner).check('Films pretes', 'private'), { exists: true, key: 'films-pretes-42' })
	assert.equal((await lists(owner).check('Films pretes', 'public')).exists, false)
	assert.equal((await lists(other).check('Films pretes', 'private')).exists, false)
})

test('private and public lists with identical labels coexist and reads enforce private ownership', async () => {
	const current = request()
	await lists(owner).save(current, 'Shared label', 'public')
	await lists(owner).save(current, 'Shared label', 'private')
	await lists(other).save(current, 'Shared label', 'private')
	const visible = async user => (await lists(user).entries()).filter(entry => entry.name === 'Shared label')
	assert.equal((await visible()).length, 1)
	assert.equal((await visible(owner)).length, 2)
	assert.equal((await visible(other)).length, 2)
	await assert.rejects(lists().load(current, 'shared-label-42'), error => error.status === 404)
	await assert.rejects(lists(other).load(current, 'shared-label-42'), error => error.status === 404)
	await lists().load(current, 'shared-label')
	assert.deepEqual(current.request.session.current, state)
})

test('protected public lists reject another user regardless of the requested new visibility', async () => {
	const current = request()
	await lists(owner).save(current, 'Protected', 'protected')
	assert.equal((await lists(other).entries()).find(entry => entry.key === 'protected').blockedBy, 'Alice')
	assert.equal((await lists(owner).entries()).find(entry => entry.key === 'protected').blockedBy, undefined)
	await lists().load(current, 'protected')
	for (const visibility of ['protected', 'public']) {
		for (const operation of [
			() => lists(other).check('Protected', visibility),
			() => lists(other).save(current, 'Protected', visibility),
			() => lists(other).remove(current, 'Protected', visibility)
		]) await assert.rejects(operation, error => error.status === 403 && error.owner === 'Alice')
	}
	await lists(other).save(current, 'Protected', 'private')
	await lists(other).save(current, 'Protected copy', 'public')
	assert.equal((await lists(owner).check('Protected', 'public')).exists, true)
	await lists(owner).save(current, 'Protected', 'public')
	await lists(other).save(current, 'Protected', 'protected')
	await assert.rejects(lists(owner).remove(current, 'Protected', 'public'), error => error.owner === 'Bob')
})

test('anonymous users can load public and default lists but cannot check, write or delete saves', async () => {
	const current = request()
	for (const operation of [
		() => lists().check('Anonymous', 'public'),
		() => lists().save(current, 'Anonymous', 'public'),
		() => lists().save(current, 'Anonymous', 'private'),
		() => lists().remove(current, 'Shared label', 'public')
	]) await assert.rejects(operation, error => error.status === 403)
	await lists().load(current, 'shared-label')
	await lists().load(current, '')
	assert.deepEqual(current.request.session.current, {})
	assert.deepEqual(lists().active(current), { modified: false })
	current.data.mode = 'edit'
	current.request.method = 'GET'
	const response = await new CustomList().html(current)
	assert.equal(response.statusCode, 403)
})

test('HTTP writes enforce authentication and method rules independently of the form', async () => {
	const current = request()
	for (const operation of ['check', 'save', 'delete']) {
		current.data = { name: 'Direct request', operation, visibility: 'public' }
		const response = await new CustomList().json(current)
		assert.equal(response.statusCode, 403)
	}
	current.request.session.user = owner
	current.request.method = 'GET'
	for (const operation of ['delete', 'load', 'save']) {
		current.data.operation = operation
		const response = await new CustomList().json(current)
		assert.equal(response.statusCode, 405)
	}
})

test('deleting the active save retains every current criterion and marks the default list modified', async () => {
	const current = request()
	await lists(owner).save(current, 'Remove me', 'private')
	lists(owner).modified(current)
	assert.equal(lists(owner).active(current).modified, true)
	await lists(owner).save(current, 'Remove me', 'private')
	assert.equal(lists(owner).active(current).modified, false)
	await lists(owner).remove(current, 'Remove me', 'private')
	assert.deepEqual(current.request.session.current, state)
	assert.deepEqual(lists(owner).active(current), { modified: true })
	assert.equal((await readdir(join(directory, 'app/movie'))).includes('remove-me-42.json'), false)
})

test('default names, empty names and traversal keys are rejected; a list may be named default', async () => {
	const current = request()
	for (const name of [' FILMS ', 'fílms', '', '?!']) {
		await assert.rejects(lists(owner).save(current, name, 'public'), error => error.status === 400)
	}
	for (const key of ['../outside', '/outside', 'UPPER', undefined]) {
		await assert.rejects(lists(owner).load(current, key), error => error.status === 404)
	}
	assert.throws(() => new CustomLists({ ...context(owner), modulePath: '../outside' }, directory))
	await lists(owner).save(current, 'default', 'public')
	await lists(owner).load(current, 'default')
	assert.equal(lists(owner).active(current).name, 'default')
})

test('changing a name or visibility creates a copy and a simplified-name collision overwrites', async () => {
	const current = request()
	await lists(owner).save(current, 'Copy source', 'private')
	await lists(owner).save(current, 'Copy source', 'public')
	await lists(owner).save(current, 'Copy destination', 'public')
	assert.ok(await readFile(join(directory, 'app/movie/copy-source-42.json')))
	assert.ok(await readFile(join(directory, 'app/movie/copy-source.json')))
	current.request.session.current.filter.title = 'Changed'
	await lists(other).save(current, 'COPY destination!', 'public')
	await lists().load(current, 'copy-destination')
	assert.equal(current.request.session.current.filter.title, 'Changed')
	assert.equal(lists().active(current).name, 'COPY destination!')
})

test('module namespaces are isolated and available entries are alphabetically sorted', async () => {
	const module = new CustomLists({ ...context(owner), modulePath: '@itrocks/library/src/module' }, directory)
	assert.deepEqual(await module.entries(), [])
	const current = request()
	await module.save(current, 'Zebra', 'public')
	await module.save(current, 'Alpha', 'private')
	assert.deepEqual((await module.entries()).map(entry => entry.name), ['Alpha', 'Zebra'])
	assert.ok(await readFile(join(directory, '@itrocks/library/src/module/alpha-42.json')))
})

test('saving omits empty filters, preserves explicit criteria and leaves session filters unchanged', async () => {
	const current = request()
	const filter = { hidden: '!empty', title: 'Alien', zero: '0' }
	current.request.session.current.filter = { ...filter, runtime: '', year: '' }
	await lists(owner).save(current, 'Useful filters', 'private')
	const saved = JSON.parse(await readFile(join(directory, 'app/movie/useful-filters-42.json'), 'utf8'))
	assert.deepEqual(saved.state.filter, filter)
	assert.deepEqual(current.request.session.current.filter, { ...filter, runtime: '', year: '' })
	await lists(owner).load(current, 'useful-filters-42')
	assert.deepEqual(current.request.session.current, { ...state, filter })

	current.request.session.current.filter = { title: '', year: '' }
	await lists(owner).save(current, 'No filters', 'public')
	const empty = JSON.parse(await readFile(join(directory, 'app/movie/no-filters.json'), 'utf8'))
	assert.equal(Object.hasOwn(empty.state, 'filter'), false)
	await lists(owner).load(current, 'no-filters')
	assert.deepEqual(current.request.session.current, { columns: state.columns, sort: state.sort })
})

test('targeted HTML writes return notifications and breadcrumbs without rendering business rows', async () => {
	const previous = dataPath()
	setDataPath(directory)
	try {
		const current = request()
		current.route = '/movie'
		current.request.session.user = owner
		current.data = { name: 'A < B & "C"', save: 'Enregistrer', visibility: 'private' }
		const action = new CustomList()
		action.htmlTemplateResponse = async (data, request, file, status) => ({ data, file, status })
		const saved = await action.html(current)
		assert.equal(saved.status, 200)
		assert.ok(saved.file.endsWith('/changed.html'))
		assert.equal(saved.data.customLink.label, 'A &lt; B &amp; &quot;C&quot;')
		assert.equal(saved.data.customLink.active, 'true')
		assert.equal(saved.data.defaultLink.active, 'false')
		assert.match(saved.data.message, /A &lt; B/)
		assert.deepEqual(current.request.session.current, state)
		current.data.operation = 'delete'
		current.request.method = 'GET'
		const render = Confirm.prototype.htmlTemplateResponse
		Confirm.prototype.htmlTemplateResponse = action.htmlTemplateResponse
		try {
			const prompt = await action.html(current)
			assert.equal(prompt.data.action, 'delete')
			assert.equal((await new CustomLists(context(owner)).check(current.data.name, 'private')).exists, true)
			// Real file sessions serialize the suspended request between requests.
			current.request.session.confirm = JSON.parse(JSON.stringify(current.request.session.confirm))
			current.request.method = 'POST'
			current.data = { confirm: prompt.data.hash }
		}
		finally { Confirm.prototype.htmlTemplateResponse = render }
		const removed = await action.html(current)
		assert.equal(removed.status, 200)
		assert.equal(removed.data.empty, 'hidden')
		assert.equal(removed.data.defaultLink.label, 'Films*')
		assert.equal(removed.data.defaultLink.active, 'true')
		assert.deepEqual(current.request.session.current, state)
		delete current.request.session.user
		current.data.operation = 'save'
		const denied = await action.html(current)
		assert.equal(denied.status, 403)
		assert.ok(denied.file.endsWith('/error.html'))
	}
	finally { setDataPath(previous) }
})
