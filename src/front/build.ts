import { build }          from '@itrocks/build/build.js'
import { simplifiedName } from '@itrocks/custom-list/names.js'
import { modalForm }      from '@itrocks/modal/modal.js'
import { defaultOptions } from '@itrocks/xtarget/xtarget.js'
import { xTargetCall }    from '@itrocks/xtarget/xtarget.js'
import { context }        from './context.js'
import { settled }        from './context.js'

const activated = new WeakSet<HTMLElement>()

function dismiss(dialog: HTMLElement): void
{
	const cancel = dialog.querySelector<HTMLAnchorElement>('a[href="about:blank"]')!
	xTargetCall(cancel.href, cancel.target)
	if (context.opener?.isConnected) context.opener.focus()
}

function edit(form: HTMLFormElement): void
{
	const confirmation = form.querySelector<HTMLElement>('.overwrite')!
	const input        = form.querySelector<HTMLInputElement>('input[name=name]')!
	const overwrite    = form.querySelector<HTMLInputElement>('input[name=overwrite]')!
	const remove       = form.querySelector<HTMLLIElement>('li.delete')!
	const removeLink   = remove.querySelector<HTMLAnchorElement>('a')!
	const save         = form.querySelector<HTMLInputElement>('input[name=save]')!
	const visibility   = () => form.querySelector<HTMLInputElement>('input[name=visibility]:checked')!.value

	const settings     = JSON.parse(form.dataset.customList!) as {
		defaultName: string
		messages:    { empty: string; invalid: string; reserved: string }
		names:       Array<{ error?: string; key: string }>
		userId:      string
	}
	const names  = new Map(settings.names.map(entry => [entry.key, entry.error]))
	let   exists = false
	let   valid  = false
	const update = () => { save.disabled = !valid || (exists && !overwrite.checked) }
	const check  = () => {
		overwrite.checked = false
		const name  = simplifiedName(input.value)
		const key   = name + (visibility() === 'private' ? '-' + settings.userId : '')
		const error = (!name || input.value.length > 160) ? settings.messages.empty
			: (name === simplifiedName(settings.defaultName)) ? settings.messages.reserved
			: ((key.length > 200) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) ? settings.messages.invalid
			: names.get(key)
		exists = names.has(key)
		valid  = error === undefined
		confirmation.hidden = !valid || !exists
		remove.hidden       = !valid || !exists
		removeLink.search   = new URLSearchParams({
			name:       input.value,
			operation:  'delete',
			visibility: visibility()
		}).toString()
		showError(form, error)
		update()
	}
	input.addEventListener('input', check)
	input.disabled = false
	for (const radio of form.querySelectorAll<HTMLInputElement>('input[name=visibility]')) {
		radio.disabled = false
		radio.addEventListener('change', check)
	}
	overwrite.addEventListener('change', update)
	removeLink.addEventListener('click', async event => {
		event.preventDefault()
		event.stopImmediatePropagation()
		await settled(form.dataset.route!)
		if (form.isConnected) {
			await xTargetCall(removeLink.href, removeLink.target, { ...defaultOptions, targetHistoryDisable: true })
		}
	})
	form.addEventListener('submit', event => {
		if (!valid || (exists && !overwrite.checked)) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}
	}, true)

	input.focus()
	input.select()
	check()
}

function showError(dialog: HTMLElement, error?: unknown): void
{
	const output       = dialog.querySelector<HTMLElement>('.error')!
	output.hidden      = !error
	output.textContent = (error instanceof Error) ? error.message : String(error ?? '')
}

build<HTMLElement>('#modal .custom-list', async dialog => {
	if (activated.has(dialog)) return
	activated.add(dialog)
	const form = dialog.querySelector<HTMLFormElement>('form')
	if (form) {
		modalForm(form)
	}
	dialog.querySelector<HTMLAnchorElement>('a[href="about:blank"]')?.focus()
	if (form) {
		// Let the normal targeted form submit run after pending column persistence.
		let readyToSubmit = false
		form.addEventListener('submit', async event => {
			if (readyToSubmit) {
				readyToSubmit = false
				return
			}
			event.preventDefault()
			event.stopImmediatePropagation()
			const submitter = event.submitter as HTMLInputElement
			await settled(dialog.dataset.route!)
			if (!dialog.isConnected) return
			// Browsers ignore requestSubmit while the original submission is still dispatching.
			setTimeout(() => {
				if (!dialog.isConnected) return
				readyToSubmit = true
				form.requestSubmit(submitter)
			})
		}, true)
	}
	dialog.addEventListener('keydown', event => {
		if (event.key === 'Escape') {
			event.preventDefault()
			dismiss(dialog)
		}
		if (event.key !== 'Tab') return
		const elements = [...dialog.querySelectorAll<HTMLElement>('input, button, a[href]')]
			.filter(element => !element.matches(':disabled') && element.getClientRects().length)
		const first = elements[0]
		const last  = elements.at(-1)
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last?.focus()
		}
		else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first?.focus()
		}
	})
	try {
		if (form) {
			edit(form)
		}
	}
	catch (error) {
		showError(dialog, error)
	}
})

document.addEventListener('keydown', event =>
{
	if (event.key !== 'Escape') return
	const form = document.querySelector<HTMLElement>('#modal .custom-list')
	if (!form) return
	event.preventDefault()
	event.stopImmediatePropagation()
	dismiss(form)
}, true)
