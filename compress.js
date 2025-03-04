const fs = require("fs")
const path = require("path")

global.log = console.log

const resourceName = 'MetaBuild'
const resourcePath = GetResourcePath(resourceName).replace('//', '/')
const zipPath = resourcePath + '/meta.zip'

const archiver = require(resourcePath + '/lib/archiver.bundle.js')

const metadataName = 'data_file'
const blacklistMeta = [
    'AUDIO_WAVEPACK',
    'AUDIO_GAMEDATA',
    'AUDIO_SOUNDDATA',
    'AUDIO_SYNTHDATA',
    'DLC_ITYP_REQUEST'
]

function Log(str) {
    return log('^2[INFO] '+ str + '^0')
}

function GetMetasInResource(dirPath, arrayOfFiles = [], manifest) {
    files = fs.readdirSync(dirPath)
  
    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = GetMetasInResource(dirPath + "/" + file, arrayOfFiles, manifest)
        } else if (file === 'fxmanifest.lua' || file === '__resource.lua' || file.substring(file.length - 5) === '.meta'){
            const isLua = file.substring(file.length - 3) === 'lua'

            if (isLua && !manifest || !isLua) arrayOfFiles.push(path.join(dirPath, "/", file))
            if (isLua && !manifest) manifest = true
        }
    })
  
    return arrayOfFiles
}

function IsBlacklistMeta(metaName) {
    for (let i = 0; i < blacklistMeta.length; i++) {
        if (blacklistMeta[i] === metaName) return true
    }

    return false
}

function GetResourcesHasMeta() {
    const resourceList = []

    for (let i = 0; i < GetNumResources(); i++) {
        const name = GetResourceByFindIndex(i)

        if (name && GetResourceState(name) == 'started') {
            for (let a = 0; a < GetNumResourceMetadata(name, metadataName); a++) {
                const metaName = GetResourceMetadata(name, metadataName, a)

                if (!IsBlacklistMeta(metaName)) {
                    resourceList.push(name)
                    break
                }
            }
        }
    }

    return resourceList
}

async function getFolderSize(dir, totalSize = 0) {
    const files = await fs.promises.readdir(dir, {withFileTypes : true})

    for (const file of files) {
        const fullPath = path.join(dir, file.name)

        if (file.isDirectory()) {
            totalSize = await getFolderSize(fullPath, totalSize)
        } else {
            const {size} = await fs.promises.stat(fullPath)
            totalSize += size
        }
    }

    return totalSize
}

async function zipFolder(sourceDir, outPath, cb) {
    const totalSize = await getFolderSize(sourceDir)
    let processedSize = 0
    let lastReportedPercent = -1

    const output = fs.createWriteStream(outPath)
    const archive = archiver('zip', {zlib : {level: 9}})

    archive.pipe(output)
    archive.directory(sourceDir, false)

    archive.on('data', (chunk) => {
        processedSize += chunk.length
        const percent = Math.floor(processedSize * 100 / totalSize)

        if (percent > lastReportedPercent) {
            log('^2[ZIP] ^7Compression progress : ^1' + percent + '%^0')
            lastReportedPercent = percent
        }
    })

    if (cb) output.on('close', cb)

    archive.on('error', console.error)
    archive.finalize()
}

function scan() {
    log('^3[WARNING] The search only takes into account resources currently started !^0')
    Log("Launch of resource indexing...^0")

    const resources = GetResourcesHasMeta()
    
    if (resources.length > 0) {
        let numMeta = 0

        for (const resource of resources) {
            const nM = GetMetasInResource(GetResourcePath(resource)).length - 1
            Log('^1' + nM + ' meta(s)^2 file(s) found in ^1' + resource)
            numMeta += nM
        }

        Log('A total of ^1' + numMeta + ' meta(s)^2 file(s) were found !')
    } else Log('No started resources uses a meta file !')
}


function init() {
    Log("Launch of resource indexing...^0")

    const resources = GetResourcesHasMeta()
    
    if (resources.length > 0) {
        Log("^1" + resources.length + " resource(s)^2 found containing meta files.^0")
        Log("Launch of meta file indexing and cloning...^0")
    
        let numMeta = 0
    
        const dirDist = resourcePath + '/dist/'
        if (!fs.existsSync(dirDist)) fs.mkdirSync(dirDist)
    
        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i]
            const files = GetMetasInResource(GetResourcePath(resource))
    
            if (files.length > 0) {
                const dirResource = dirDist + resource + '/'
                if (!fs.existsSync(dirResource)) fs.mkdirSync(dirResource)
    
                for (let f = 0; f < files.length; f++) {
                    const file = files[f]
                    const filePath = file.substring(file.indexOf(resource) + resource.length + 1)
                    const dirPath = path.dirname(filePath)
    
                    if (dirPath !== '.') {
                        fs.mkdirSync(dirResource + dirPath, { recursive: true })
                    }

                    fs.copyFileSync(file, dirResource + filePath)
                    numMeta++
                }
            }
        }
    
        if (numMeta > 0) {
            Log("^1" + numMeta + " meta(s)^2 file(s) found.^0")
            Log("Starting the compression process...^0")
    
            zipFolder(dirDist, zipPath, () => {
                log("^2[SUCCESS] Compressions complete, you can retrieve the file here :^3 \n> " + zipPath + '^0')
            })
        } else log("^1[ERROR] No meta file found, process stopped !^0")
    } else log("^1[ERROR] No started resources uses a meta file !^0")
}

RegisterCommand('metabuild', (_src, args) => {
    if (_src !== 0) return

    if (args[0] === 'build') {
        init()
    } else if (args[0] === 'scan') {
        scan()
    } else log("^1[ERROR] Invalid argument, use only build or scan.^0")
})