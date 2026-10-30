import { Request } from '@itrocks/action-request'

export type ListState = {
	columns?: string[]
	filter?:  Record<string, string>
	sort?:    [string, boolean][]
}

export type ListUser = {
	id:   string;
	name: string
}

export type CustomListContext = {
	defaultName: string
	key:         string
	modulePath:  string
	user?:       ListUser
}

export type CustomListDependencies = {
	context: (request: Request) => Promise<CustomListContext>
	state: {
		read(request: Request): ListState
		replace(request: Request, state?: ListState): void
	}
}

export const dependencies: CustomListDependencies = {
	context: async () => { throw new Error('Custom list context is not configured') },
	state: {
		read:    () => { throw new Error('List state is not configured') },
		replace: () => { throw new Error('List state is not configured') }
	}
}

export function customListDependsOn(overrides: Partial<CustomListDependencies>): void
{
	Object.assign(dependencies, overrides)
}
