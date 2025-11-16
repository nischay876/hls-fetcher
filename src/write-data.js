/* eslint-disable no-console */
const Promise = require('bluebird');
const mkdirp = require('mkdirp');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const fs = Promise.promisifyAll(require('fs'));
const AesDecrypter = require('aes-decrypter').Decrypter;
const path = require('path');

// Configure axios retry
axiosRetry(axios, { 
  retries: 3,
  retryDelay: (retryCount) => {
    return retryCount * 500;
  },
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});

const writeFile = async function(file, content) {
  // Handle mkdirp v3+ API properly
  await mkdirp(path.dirname(file));
  return fs.writeFileAsync(file, content);
};

const requestFile = function(uri) {
  return axios({
    url: uri,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 30000
  }).then(function(response) {
    return Buffer.from(response.data);
  });
};

const toUint8Array = function(nodeBuffer) {
  return new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};

const decryptFile = function(content, encryption) {
  return new Promise(function(resolve, reject) {
    /* eslint-disable no-new */
    // this is how you use it, its kind of bad but :shrug:
    new AesDecrypter(toUint8Array(content), encryption.bytes, encryption.iv, function(err, bytes) {
      if (err) {
        return reject(err);
      }
      return resolve(Buffer.from(bytes));
    });
    /* eslint-enable no-new */
  });
};

const renameRootManifest = async function(outputPath) {
  try {
    // Get all files in the output directory
    const files = fs.readdirSync(outputPath);
    
    // Look for .m3u8 files that are not in subdirectories and not already named master.m3u8
    const m3u8Files = files.filter(file => 
      path.extname(file) === '.m3u8' && 
      file !== 'master.m3u8' &&
      fs.statSync(path.join(outputPath, file)).isFile()
    );
    
    // If we found exactly one .m3u8 file in the root, rename it to master.m3u8
    if (m3u8Files.length === 1) {
      const oldName = m3u8Files[0];
      const oldPath = path.join(outputPath, oldName);
      const newPath = path.join(outputPath, 'master.m3u8');
      
      fs.renameSync(oldPath, newPath);
      console.log(`🔄 Renamed ${oldName} to master.m3u8`);
    }
  } catch (err) {
    console.warn(`⚠️  Could not rename root manifest: ${err.message}`);
  }
};

const WriteData = function(decrypt, concurrency, resources, outputPath) {
  const inProgress = [];
  const operations = [];
  let completed = 0;
  const total = resources.length;

  // Show progress every 10%
  const progressInterval = Math.max(1, Math.floor(total / 10));
  
  console.log(`🚀 Starting download of ${total} resources with concurrency ${concurrency}`);

  resources.forEach(function(r) {
    if (r.content) {
      operations.push(async function() {
        await writeFile(r.file, r.content);
        completed++;
        if (completed % progressInterval === 0 || completed === total) {
          console.log(`📊 Progress: ${completed}/${total} (${Math.round((completed/total)*100)}%)`);
        }
      });
    } else if (r.uri && r.key && decrypt) {
      operations.push(async function() {
        const content = await requestFile(r.uri);
        const decryptedContent = await decryptFile(content, r.key);
        await writeFile(r.file, decryptedContent);
        completed++;
        if (completed % progressInterval === 0 || completed === total) {
          console.log(`📊 Progress: ${completed}/${total} (${Math.round((completed/total)*100)}%)`);
        }
      });
    } else if (r.uri && inProgress.indexOf(r.uri) === -1) {
      operations.push(async function() {
        const content = await requestFile(r.uri);
        await writeFile(r.file, content);
        completed++;
        if (completed % progressInterval === 0 || completed === total) {
          console.log(`📊 Progress: ${completed}/${total} (${Math.round((completed/total)*100)}%)`);
        }
      });
      inProgress.push(r.uri);
    }
  });

  return Promise.map(operations, function(o) {
    return o();
  }, {concurrency}).then(async function() {
    // Simple rename: find the .m3u8 file in root output dir and rename it to master.m3u8
    if (outputPath) {
      renameRootManifest(outputPath);
    }
    
    console.log(`🎉 Download completed! Successfully processed ${total} resources.`);
    return Promise.resolve();
  }).catch(function(error) {
    console.error(`💥 Download failed with error:`, error);
    throw error;
  });
};

module.exports = WriteData;
