import {sub} from "https://cdn.skypack.dev/date-fns";

const configPrefix = ''
const configSuffix = '_config.json'
const cacheSuffix = '_cache.json'

const devCliPath = './.dev_cli/'
const devCliPrivatePath = './.dev_cli/.private/'

const readFile = async <A>(path: string): Promise<A> => {
  const res = await Deno.readTextFile(path)
  try {
    return JSON.parse(res)
  } catch (e) {
    return res.trim()
  }
}

const getConfigFromDevCliFolder = <A>(configName: string): Promise<A> => {
  return readFile(`${devCliPath}${configPrefix}${configName}${configSuffix}`)
}

const getPrivateConfigFromDevCliFolder = <A>(configName: string): Promise<A> => {
  return readFile(`${devCliPrivatePath}${configPrefix}${configName}${configSuffix}`)
}

const getConfigFromHomeDirectory = <A>(configName: string): Promise<A> => {
  return readFile(`${Deno.env.get('HOME')}/.dev_cli/${configPrefix}${configName}${configSuffix}`)
}

const validateCachedData = <A>(data: CachedData<A>): boolean => {
  const prevDate = sub(new Date(), { seconds: data.ttl });
  const cacheDate = new Date(data.lastUpdated);
  return prevDate < cacheDate;
}

export const getConfig = async <A>(configName: string): Promise<A> => {
  let res
  try {
    res = await getConfigFromDevCliFolder(configName)
  } catch (e) {
    res = await getConfigFromHomeDirectory(configName)
  }
  if (res) {
    return res
  }
  throw new Error('no config found')
}

export const getPrivateConfig = <A>(configName: string): Promise<A> => {
  try {
    return getPrivateConfigFromDevCliFolder(configName)
  } catch (e) {
    return getConfigFromHomeDirectory(configName)
  }
}

export const getCachedConfig = async <A>(configName: string): Promise<A> => {
  const cachedData = await readFile(`${devCliPrivatePath}${configPrefix}${configName}${cacheSuffix}`)
  if (validateCachedData(cachedData)) {
    return cachedData.data
  }
}

export const writeConfig = <A>(configName: string, data: A): void => {
  return Deno.writeTextFile(`${devCliPath}${configPrefix}${configName}${configSuffix}`, JSON.stringify(data))
}

export const writePrivateConfig = <A>(configName: string, data: A): void => {
  return Deno.writeTextFile(`${devCliPrivatePath}${configPrefix}${configName}${configSuffix}`, JSON.stringify(data))
}

export const writeCachedConfig = <A>(configName: string, data: A, ttl: number): void => {
  return Deno.writeTextFile(`${devCliPrivatePath}${configPrefix}${configName}${cacheSuffix}`, JSON.stringify({
    lastUpdated: new Date().getTime(),
    ttl,
    data,
  }))
}
