import { Request }           from '@itrocks/action-request'
import { dataPath }          from '@itrocks/data-path'
import { randomUUID }        from 'node:crypto'
import { mkdir }             from 'node:fs/promises'
import { readdir }           from 'node:fs/promises'
import { readFile }          from 'node:fs/promises'
import { rename }            from 'node:fs/promises'
import { unlink }            from 'node:fs/promises'
import { writeFile }         from 'node:fs/promises'
import { join }              from 'node:path'
import { CustomListContext } from './dependencies'
import { dependencies }      from './dependencies'
import { ListState }         from './dependencies'
import { ListUser }          from './dependencies'
import { simplifiedName }    from './names'

export { simplifiedName }

export type Visibility = 'private' | 'public' | 'protected'

export type SavedList = {
	name:       string
	owner:      ListUser
	state:      ListState
	visibility: Visibility
}

export type ActiveList = {
	key?:        string
	modified:    boolean
	name?:       string
	visibility?: Visibility
}

const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class CustomListError extends Error
{

	constructor(message: string, public readonly status = 400, public readonly owner = '')
	{
		super(message)
	}

}

export class CustomLists
{

	constructor(readonly context: CustomListContext, private readonly directory = dataPath('custom-lists'))
	{
		if (
			!context.modulePath
			|| context.modulePath.split(/[\\/]/).some(part => !part || part === '.' || part === '..')
		) {
			throw new TypeError('Invalid business module path')
		}
	}

	active(request: Request): ActiveList
	{
		return request.request.session.customLists?.[this.context.key]
			?? { modified: false }
	}

	async check(name: string, visibility: Visibility)
	{
		this.requireUser()
		const key      = this.key(name, visibility)
		const existing = await this.read(key)
		if (existing) {
			this.requireWrite(existing)
		}
		return {
			exists: !!existing,
			key
		}
	}

	async entries(): Promise<Array<{ blockedBy?: string; key: string; name: string; visibility: Visibility }>>
	{
		let files: string[]
		try {
			files = await readdir(this.path())
		}
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return []
			}
			throw error
		}
		const entries = []
		for (const file of files) {
			if (!file.endsWith('.json') || !keyPattern.test(file.slice(0, -5))) continue
			const key   = file.slice(0, -5)
			const saved = await this.read(key)
			if (saved && this.canRead(saved)) {
				entries.push({
					blockedBy: (saved.visibility === 'protected') && this.context.user && (saved.owner.id !== this.context.user.id)
						? saved.owner.name
						: undefined,
					key,
					name:       saved.name,
					visibility: saved.visibility
				})
			}
		}
		return entries.sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key))
	}

	key(name: string, visibility: Visibility): string
	{
		if (!['private', 'protected', 'public'].includes(visibility)) throw new CustomListError('Invalid visibility')
		if ((typeof name !== 'string') || !simplifiedName(name) || (name.length > 160)) {
			throw new CustomListError('Please enter a name for your list')
		}
		if (simplifiedName(name) === simplifiedName(this.context.defaultName)) {
			throw new CustomListError('Please enter another name for your custom list')
		}
		const suffix = (visibility === 'private') ? ('-' + this.requireUser().id) : ''
		const key    = simplifiedName(name) + suffix
		if (!keyPattern.test(key) || key.length > 200) {
			throw new CustomListError('Invalid list name')
		}
		return key
	}

	async load(request: Request, key: string): Promise<void>
	{
		if (typeof key !== 'string') {
			throw new CustomListError('List unavailable', 404)
		}
		if (key === '') {
			dependencies.state.replace(request)
			this.setActive(request, { modified: false })
			return
		}
		const saved = await this.read(key)
		if (!saved || !this.canRead(saved)) {
			throw new CustomListError('List unavailable', 404)
		}
		dependencies.state.replace(request, saved.state)
		this.setActive(request, { key, modified: false, name: saved.name, visibility: saved.visibility })
	}

	modified(request: Request): void
	{
		this.setActive(request, { ...this.active(request), modified: true })
	}

	async remove(request: Request, name: string, visibility: Visibility): Promise<void>
	{
		this.requireUser()
		const key   = this.key(name, visibility)
		const saved = await this.read(key)
		if (!saved) {
			throw new CustomListError('List unavailable', 404)
		}
		this.requireWrite(saved)
		await unlink(this.path(key))
		if (this.active(request).key === key) {
			this.setActive(request, { modified: true })
		}
	}

	async save(request: Request, name: string, visibility: Visibility): Promise<void>
	{
		const owner    = this.requireUser()
		const key      = this.key(name, visibility)
		const existing = await this.read(key)
		if (existing) {
			this.requireWrite(existing)
		}
		const state = { ...dependencies.state.read(request) }
		if (state.filter) {
			state.filter = Object.fromEntries(Object.entries(state.filter).filter(([, value]) => value !== ''))
			if (!Object.keys(state.filter).length) {
				delete state.filter
			}
		}
		const saved: SavedList = { name, owner, state, visibility }
		await mkdir(this.path(), { recursive: true })
		const temporary = join(this.path(), '.' + randomUUID())
		try {
			await writeFile(temporary, JSON.stringify(saved, null, '\t') + '\n', { flag: 'wx', mode: 0o600 })
			// Atomic replacement prevents partial JSON; concurrent saves deliberately use the last writer.
			await rename(temporary, this.path(key))
		}
		finally {
			await unlink(temporary).catch(error => {
				if (error.code !== 'ENOENT') throw error
			})
		}
		this.setActive(request, { key, modified: false, name, visibility })
	}

	private canRead(saved: SavedList): boolean
	{
		return (saved.visibility !== 'private') || (saved.owner.id === this.context.user?.id)
	}

	private path(key?: string): string
	{
		if ((key !== undefined) && (!keyPattern.test(key) || (key.length > 200))) {
			throw new CustomListError('List unavailable', 404)
		}
		return join(this.directory, this.context.modulePath, (key === undefined) ? '' : (key + '.json'))
	}

	private async read(key: string): Promise<SavedList | undefined>
	{
		let saved: SavedList
		try {
			saved = JSON.parse(await readFile(this.path(key), 'utf8'))
		}
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
			throw error
		}
		if (
			!saved || !saved.owner || !saved.state
			|| (typeof saved.name !== 'string') || (typeof saved.owner.id !== 'string')
			|| (typeof saved.owner.name !== 'string') || !['private', 'protected', 'public'].includes(saved.visibility)
			|| (typeof saved.state !== 'object')
		) {
			throw new Error('Invalid saved list')
		}
		return saved
	}

	private requireUser(): ListUser
	{
		if (!this.context.user) {
			throw new CustomListError('Sign in to save a list', 403)
		}
		return this.context.user
	}

	private requireWrite(saved: SavedList): void
	{
		const user = this.requireUser()
		if (!this.canRead(saved)) {
			throw new CustomListError('This list name is unavailable', 403)
		}
		if ((saved.visibility !== 'public') && (saved.owner.id !== user.id)) {
			throw new CustomListError('Only user $1 can modify this list', 403, saved.owner.name)
		}
	}

	private setActive(request: Request, active: ActiveList): void
	{
		request.request.session.customLists ??= {}
		request.request.session.customLists[this.context.key] = active
	}

}
