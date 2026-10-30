
export type BrowserDependencies = {
	settled: (article: HTMLElement) => Promise<void>
}

const dependencies: BrowserDependencies = {
	settled: async () => {}
}

export const context: {
	loadingRoute?: string
	opener?:       HTMLElement
} = {}

export function customListBrowserDependsOn(overrides: Partial<BrowserDependencies>): void
{
	Object.assign(dependencies, overrides)
}

export function currentList(route: string): HTMLElement | null
{
	const article = document.querySelector<HTMLElement>('main > article[data-action=list]')
	return (article?.dataset.route === route) ? article : null
}

export async function settled(route: string): Promise<void>
{
	const article = currentList(route)
	if (article) {
		await dependencies.settled(article)
	}
}
