import { Action }          from '@itrocks/action'
import { Request }         from '@itrocks/action-request'
import { Confirm }         from '@itrocks/confirm'
import { Route }           from '@itrocks/route'
import { tr }              from '@itrocks/translate'
import { CustomListError } from './custom-lists'
import { CustomLists }     from './custom-lists'
import { Visibility }      from './custom-lists'
import { dependencies }    from './dependencies'

const headers = { 'Cache-Control': 'no-store' }

function breadcrumbData(request: Request, lists: CustomLists, view = 'list')
{
	const active  = lists.active(request)
	const context = lists.context
	const link = (key: string, name: string, modified: boolean) => ({
		active: String(key === (active.key ?? '')),
		href:   (view === 'list')
			? `${request.route}/custom-list?mode=choose`
			: `${request.route}/list?${new URLSearchParams({ custom: key })}`,
		key,
		label:    escapeText(name + (modified ? '*' : '')),
		modified: String(modified),
		route:    request.route,
		target:   (view === 'list') ? '#modal' : 'main',
		writable: String(!!context.user)
	})
	return {
		customLink:  active.key && link(active.key, active.name!, active.modified),
		defaultLink: link('', context.defaultName, !active.key && active.modified),
		empty:       active.key ? undefined : 'hidden'
	}
}

function escapeText(value: string): string
{
	return value.replace(
		/[&<>"']/g,
		character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!
	)
}

@Route('/custom-list')
export class CustomList extends Action
{

	async breadcrumbView(request: Request)
	{
		const lists = new CustomLists(await dependencies.context(request))
		return { ...breadcrumbData(request, lists), template: '/@itrocks/custom-list/cjs/list-breadcrumb.html' }
	}

	async html(request: Request)
	{
		const confirm   = new Confirm()
		const confirmed = ((request.request.method === 'POST') && request.data.confirm)
			? confirm.confirmed(request)
			: undefined
		if (confirmed) {
			// Persisted confirmation requests may have lost their prototypes during session serialization.
			confirmed.type = request.type
			request        = Object.assign(Object.create(Object.getPrototypeOf(request)), confirmed)
		}
		const context   = await dependencies.context(request)
		const lists     = new CustomLists(context)
		const operation = request.data.operation ?? ((request.data.save === undefined) ? undefined : 'save')
		if (
			confirmed
			|| (request.request.method === 'POST')
			|| ((request.request.method === 'GET') && (operation === 'delete'))
		) {
			try {
				if (operation === 'save') {
					await lists.save(request, request.data.name as string, request.data.visibility as Visibility)
				}
				else if (operation === 'delete') {
					if (!confirmed) {
						const existing = await lists.check(request.data.name as string, request.data.visibility as Visibility)
						if (!existing.exists) {
							throw new CustomListError('List unavailable', 404)
						}
						return confirm.html(
							request, tr('Do you confirm deletion') + tr('?') + '\n'
							+ escapeText(request.data.name as string), 'delete', '#notifications:prepend'
						)
					}
					await lists.remove(request, request.data.name as string, request.data.visibility as Visibility)
				}
				else throw new CustomListError('Unknown list operation')
				return this.htmlTemplateResponse({
					...breadcrumbData(request, lists),
					message: escapeText(tr(operation === 'save' ? '$1 saved' : '$1 deleted', [request.data.name as string]))
				}, request, __dirname + '/changed.html', 200, { ...headers })
			}
			catch (error) {
				const message = (error instanceof CustomListError)
					? tr(error.message, [error.owner])
					: tr('Unable to save this list')
				return this.htmlTemplateResponse(
					{ error: escapeText(message) },
					request, __dirname + '/error.html', (error instanceof CustomListError) ? error.status : 500, { ...headers }
				)
			}
		}
		if ((request.data.operation === 'save') || (request.data.operation === 'delete')) {
			return this.htmlTemplateResponse(
				{ error: tr('Method not allowed') },
				request, __dirname + '/error.html', 405, { ...headers }
			)
		}
		if (request.data.mode === 'breadcrumb') {
			return this.htmlTemplateResponse(
				breadcrumbData(request, lists, request.data.view as string),
				request, __dirname + '/breadcrumb.html', 200, { ...headers }
			)
		}
		const editing = request.data.mode === 'edit'
		if (editing && !context.user) {
			return this.htmlTemplateResponse(
				{ error: tr('Sign in to save a list') },
				request, __dirname + '/error.html', 403, { ...headers }
			)
		}
		const active = lists.active(request)
		if (editing) {
			const messages = {
				empty:    tr('Please enter a name for your list'),
				invalid:  tr('Invalid list name'),
				reserved: tr('Please enter another name for your custom list')
			}
			const names = (await lists.entries()).map(entry => ({
				key:   entry.key,
				error: (entry.blockedBy === undefined)
					? undefined
					: tr('Only user $1 can modify this list', [entry.blockedBy])
			}))
			const validationMessages =
				[...new Set([
					...Object.values(messages),
					...names.flatMap(entry => entry.error === undefined ? [] : [entry.error])
				])]
				.map(message => ({ message: escapeText(message) }))
			const visibility = active.visibility ?? 'private'
			return this.htmlTemplateResponse({
				bootstrap: escapeText(JSON.stringify({
					defaultName: context.defaultName,
					messages,    names,
					userId:      context.user!.id
				})),
				name:             escapeText(active.name ?? context.defaultName),
				privateChecked:   (visibility === 'private')   ? 'checked' : undefined,
				protectedChecked: (visibility === 'protected') ? 'checked' : undefined,
				publicChecked:    (visibility === 'public')    ? 'checked' : undefined,
				route:            request.route,
				validationMessages
			}, request, __dirname + '/save.html', 200, { ...headers })
		}
		const entries = [{ key: '', name: context.defaultName, visibility: 'default' }, ...await lists.entries()]
		return this.htmlTemplateResponse({
			entries: entries.map(entry => ({
				defaultClass: (entry.visibility === 'default') ? 'default' : undefined,
				href:         `${request.route}/list?${new URLSearchParams({ custom: entry.key })}`,
				icon: {
					kind:  entry.visibility === 'default' ? 'default' : entry.visibility === 'private' ? 'private' : 'public',
					label: tr(entry.visibility === 'default'
						? 'Default list'
						: entry.visibility === 'private' ? 'Private list' : 'Public list')
				},
				key:      entry.key,
				label:    escapeText(entry.name),
				route:    request.route,
				selected: String(entry.key === (active.key ?? '')),
				tabIndex: (entry.key === (active.key ?? '')) ? 0 : -1
			})),
			route: request.route
		}, request, __dirname + '/choose.html', 200, { ...headers })
	}

	async json(request: Request)
	{
		try {
			const context   = await dependencies.context(request)
			const lists     = new CustomLists(context)
			const operation = request.data.operation ?? 'status'
			if (operation === 'status') {
				return this.jsonResponse({
					active:      lists.active(request),
					defaultName: context.defaultName,
					writable:    !!context.user
				}, 200, { ...headers })
			}
			if (operation === 'entries') {
				return this.jsonResponse((await lists.entries()).map(entry => ({
					...entry,
					iconLabel: tr((entry.visibility === 'private') ? 'Private list' : 'Public list')
				})), 200, { ...headers })
			}
			if (operation === 'check') {
				return this.jsonResponse(
					await lists.check(request.data.name as string, request.data.visibility as Visibility),
					200, { ...headers }
				)
			}
			if (request.request.method !== 'POST') {
				return this.jsonResponse({ error: 'Method not allowed' }, 405, { ...headers })
			}
			if (operation === 'load') {
				await lists.load(request, request.data.key as string)
			}
			else if (operation === 'save') {
				await lists.save(request, request.data.name as string, request.data.visibility as Visibility)
			}
			else if (operation === 'delete') {
				await lists.remove(request, request.data.name as string, request.data.visibility as Visibility)
			}
			else throw new CustomListError('Unknown list operation')
			return this.jsonResponse({ active: lists.active(request) }, 200, { ...headers })
		}
		catch (error) {
			if (!(error instanceof CustomListError)) {
				throw error
			}
			return this.jsonResponse({ error: tr(error.message, [error.owner]) }, error.status, { ...headers })
		}
	}

}
