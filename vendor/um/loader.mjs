let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); }
let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_3.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}
/**
 * QMC1 (qmcflac) decipher, decrypt buffer at given offset.
 * @param {Uint8Array} buffer
 * @param {number} offset
 */
function decryptQMC1(buffer, offset) {
    var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.decryptQMC1(ptr0, len0, buffer, offset);
}

/**
 * QRC Decrypt ("*.qrc" cache file)
 * @param {Uint8Array} buffer
 * @returns {Uint8Array}
 */
function decryptQRCFile(buffer) {
    var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.decryptQRCFile(ptr0, len0, buffer);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * QRC Decrypt (network response)
 * @param {string} buffer
 * @returns {Uint8Array}
 */
function decryptQRCNetwork(buffer) {
    const ptr0 = passStringToWasm0(buffer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decryptQRCNetwork(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}
/**
 * Create a decipher instance for "BoDian Music".
 * @param {string} ekey
 * @returns {QMC2}
 */
function kuwoBodianCipherFactory(ekey) {
    const ptr0 = passStringToWasm0(ekey, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.kuwoBodianCipherFactory(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return QMC2.__wrap(ret[0]);
}

/**
 * Create a decipher instance for "Kuwo KWM v2".
 * @param {string} ekey
 * @returns {QMC2}
 */
function kuwoV2CipherFactory(ekey) {
    const ptr0 = passStringToWasm0(ekey, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.kuwoV2CipherFactory(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return QMC2.__wrap(ret[0]);
}

/**
 * Detect audio type for given file header.
 * Recommended a buffer of 1024 bytes.
 * @param {Uint8Array} buffer
 * @returns {AudioTypeResult}
 */
function detectAudioType(buffer) {
    const ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.detectAudioType(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return AudioTypeResult.__wrap(ret[0]);
}

/**
 * Init panic hook
 */
function initPanicHook() {
    wasm.initPanicHook();
}

/**
 * Decrypt X2M Header
 * @param {Uint8Array} buffer
 */
function decryptX2MHeader(buffer) {
    var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.decryptX2MHeader(ptr0, len0, buffer);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Decrypt X3M Header
 * @param {Uint8Array} buffer
 */
function decryptX3MHeader(buffer) {
    var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.decryptX3MHeader(ptr0, len0, buffer);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

const AudioTypeResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_audiotyperesult_free(ptr >>> 0, 1));
/**
 * Detected audio result
 */
class AudioTypeResult {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AudioTypeResult.prototype);
        obj.__wbg_ptr = ptr;
        AudioTypeResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AudioTypeResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_audiotyperesult_free(ptr, 0);
    }
    /**
     * When this field is not zero, it means we need to feed this amount of bytes to the detector.
     * @returns {number}
     */
    get needMore() {
        const ret = wasm.__wbg_get_audiotyperesult_needMore(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * When this field is not zero, it means we need to feed this amount of bytes to the detector.
     * @param {number} arg0
     */
    set needMore(arg0) {
        wasm.__wbg_set_audiotyperesult_needMore(this.__wbg_ptr, arg0);
    }
    /**
     * Audio extension, without "."
     * When is unknown, it will return "bin".
     * @returns {string}
     */
    get audioType() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_audiotyperesult_audioType(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Audio extension, without "."
     * When is unknown, it will return "bin".
     * @param {string} arg0
     */
    set audioType(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_audiotyperesult_audioType(this.__wbg_ptr, ptr0, len0);
    }
}

const JooxFileFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_jooxfile_free(ptr >>> 0, 1));
/**
 * Joox file.
 */
class JooxFile {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(JooxFile.prototype);
        obj.__wbg_ptr = ptr;
        JooxFileFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JooxFileFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jooxfile_free(ptr, 0);
    }
    /**
     * Get the buffer size to allocate for decrypt method.
     * @returns {number}
     */
    get bufferLength() {
        const ret = wasm.jooxfile_bufferLength(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Initialize header. Header should be 0x0c bytes.
     * @param {Uint8Array} header
     * @param {string} uuid
     * @returns {JooxFile}
     */
    static parse(header, uuid) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(uuid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.jooxfile_parse(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return JooxFile.__wrap(ret[0]);
    }
    /**
     * Decrypt a given block of buffer (see {@link bufferLength})
     * Return the length of decrypted & unpadded data from the input buffer.
     * @param {Uint8Array} buffer
     * @returns {number}
     */
    decrypt(buffer) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.jooxfile_decrypt(this.__wbg_ptr, ptr0, len0, buffer);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
}

const KWMDecipherFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kwmdecipher_free(ptr >>> 0, 1));
/**
 * Common V1/V2 wrapper interface, derived from `KuwoHeader.makeCipher`
 */
class KWMDecipher {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KWMDecipherFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kwmdecipher_free(ptr, 0);
    }
    /**
     * Create an instance of cipher (decipher) for decryption
     * @param {KuwoHeader} header
     * @param {string | undefined} [ekey]
     */
    constructor(header, ekey) {
        _assertClass(header, KuwoHeader);
        var ptr0 = isLikeNone(ekey) ? 0 : passStringToWasm0(ekey, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.kwmdecipher_make_decipher(header.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        KWMDecipherFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Decrypt buffer at given offset.
     * @param {Uint8Array} buffer
     * @param {number} offset
     */
    decrypt(buffer, offset) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.kwmdecipher_decrypt(this.__wbg_ptr, ptr0, len0, buffer, offset);
    }
}

const KWMDecipherV1Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kwmdecipherv1_free(ptr >>> 0, 1));
/**
 * Kuwo KWM v1
 */
class KWMDecipherV1 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KWMDecipherV1Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kwmdecipherv1_free(ptr, 0);
    }
    /**
     * Create a decipher instance for "Kuwo KWM v1".
     * @param {Uint8Array} buffer
     * @param {number} offset
     */
    decrypt(buffer, offset) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.kwmdecipherv1_decrypt(this.__wbg_ptr, ptr0, len0, buffer, offset);
    }
}

const KuGouFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kugou_free(ptr >>> 0, 1));
/**
 * KuGou KGM file decipher.
 */
class KuGou {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(KuGou.prototype);
        obj.__wbg_ptr = ptr;
        KuGouFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KuGouFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kugou_free(ptr, 0);
    }
    /**
     * Decrypt Kugou PC client db.
     * @param {Uint8Array} database
     */
    static decryptDatabase(database) {
        var ptr0 = passArray8ToWasm0(database, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.kugou_decryptDatabase(ptr0, len0, database);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Parse the KuGou header (0x400 bytes recommended).
     * @param {Uint8Array} header
     * @returns {KuGou}
     */
    static from_header(header) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.kugou_from_header(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return KuGou.__wrap(ret[0]);
    }
    /**
     * Parse the KuGou header (0x400 bytes recommended).
     * @param {KuGouHeader} header
     * @param {string | undefined} [ekey]
     * @returns {KuGou}
     */
    static fromHeaderV5(header, ekey) {
        _assertClass(header, KuGouHeader);
        var ptr0 = isLikeNone(ekey) ? 0 : passStringToWasm0(ekey, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.kugou_fromHeaderV5(header.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return KuGou.__wrap(ret[0]);
    }
    /**
     * Decrypt a buffer.
     * @param {Uint8Array} buffer
     * @param {number} offset
     */
    decrypt(buffer, offset) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.kugou_decrypt(this.__wbg_ptr, ptr0, len0, buffer, offset);
    }
}

const KuGouHeaderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kugouheader_free(ptr >>> 0, 1));
/**
 * KuGou KGM file header.
 */
class KuGouHeader {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KuGouHeaderFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kugouheader_free(ptr, 0);
    }
    /**
     * Get the audio hash (kgm v5).
     * @returns {string}
     */
    get audioHash() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.kugouheader_audioHash(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get version
     * @returns {number}
     */
    get version() {
        const ret = wasm.kugouheader_version(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get offset to encrypted data
     * @returns {number}
     */
    get offsetToData() {
        const ret = wasm.kugouheader_offsetToData(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Parse the KuGou header (0x400 bytes recommended).
     * @param {Uint8Array} header
     */
    constructor(header) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.kugouheader_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        KuGouHeaderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const KuwoHeaderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kuwoheader_free(ptr >>> 0, 1));
/**
 * Kuwo KWM file header.
 */
class KuwoHeader {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(KuwoHeader.prototype);
        obj.__wbg_ptr = ptr;
        KuwoHeaderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KuwoHeaderFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kuwoheader_free(ptr, 0);
    }
    /**
     * Get quality id (used for Android Kuwo APP),
     *   that can be then used to extract ekey from mmkv db.
     * @returns {number}
     */
    get qualityId() {
        const ret = wasm.kuwoheader_qualityId(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get resource id
     * @returns {number}
     */
    get resourceId() {
        const ret = wasm.kuwoheader_resourceId(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Parse the KuWo header (0x400 bytes)
     * @param {Uint8Array} header
     * @returns {KuwoHeader}
     */
    static parse(header) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.kuwoheader_parse(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return KuwoHeader.__wrap(ret[0]);
    }
}

const Migu3DFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_migu3d_free(ptr >>> 0, 1));
/**
 * Migu3D MG3D file decipher.
 */
class Migu3D {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Migu3D.prototype);
        obj.__wbg_ptr = ptr;
        Migu3DFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        Migu3DFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_migu3d_free(ptr, 0);
    }
    /**
     * Create a new decipher and guess its key from first 0x100 bytes.
     * @param {Uint8Array} header
     * @returns {Migu3D}
     */
    static fromHeader(header) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.migu3d_fromHeader(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Migu3D.__wrap(ret[0]);
    }
    /**
     * Create a new decipher from file_key
     * @param {string} file_key
     * @returns {Migu3D}
     */
    static fromFileKey(file_key) {
        const ptr0 = passStringToWasm0(file_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.migu3d_fromFileKey(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Migu3D.__wrap(ret[0]);
    }
    /**
     * Decrypt encrypted buffer part.
     * @param {Uint8Array} buffer
     * @param {number} offset
     */
    decrypt(buffer, offset) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.migu3d_decrypt(this.__wbg_ptr, ptr0, len0, buffer, offset);
    }
}

const NCMFileFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ncmfile_free(ptr >>> 0, 1));
/**
 * NCMFile
 */
class NCMFile {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NCMFileFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ncmfile_free(ptr, 0);
    }
    /**
     * Get audio data offset.
     * @returns {number}
     */
    get audioOffset() {
        const ret = wasm.ncmfile_audioOffset(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Create a NCMFile instance
     */
    constructor() {
        const ret = wasm.ncmfile_new();
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        NCMFileFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Open NCM file.
     * If everything is ok, return `0`.
     * If it needs more header bytes, return positive integer.
     * If it was not a valid NCM file, return -1.
     *
     * # Arguments
     *
     * * `header`: Header bytes of NCM file.
     *
     * returns: Result<i32, JsError>
     *
     * If it needs more bytes, the new header size will be returned.
     * If the header was large enough, it will return 0.
     * @param {Uint8Array} header
     * @returns {number}
     */
    open(header) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ncmfile_open(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * Decrypt buffer.
     *
     * # Arguments
     *
     * * `buffer`: Buffer to decrypt.
     * * `offset`: Offset (start from 0, of encrypted binary data)
     *
     * returns: Result<(), JsError>
     * @param {Uint8Array} buffer
     * @param {number} offset
     */
    decrypt(buffer, offset) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.ncmfile_decrypt(this.__wbg_ptr, ptr0, len0, buffer, offset);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}

const QMC2Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_qmc2_free(ptr >>> 0, 1));
/**
 * QMC2 (mgg/mflac) cipher
 */
class QMC2 {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(QMC2.prototype);
        obj.__wbg_ptr = ptr;
        QMC2Finalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QMC2Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_qmc2_free(ptr, 0);
    }
    /**
     * Create a new QMC2 (mgg/mflac) cipher instance.
     * @param {string} ekey
     */
    constructor(ekey) {
        const ptr0 = passStringToWasm0(ekey, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qmc2_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        QMC2Finalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Decrypt buffer at given offset.
     * @param {Uint8Array} buffer
     * @param {number} offset
     */
    decrypt(buffer, offset) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.qmc2_decrypt(this.__wbg_ptr, ptr0, len0, buffer, offset);
    }
}

const QMCFooterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_qmcfooter_free(ptr >>> 0, 1));
/**
 * QMC Footer.
 */
class QMCFooter {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(QMCFooter.prototype);
        obj.__wbg_ptr = ptr;
        QMCFooterFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QMCFooterFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_qmcfooter_free(ptr, 0);
    }
    /**
     * Get media name (MusicEx)
     * @returns {string | undefined}
     */
    get mediaName() {
        const ret = wasm.qmcfooter_mediaName(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Get eKey (if embedded)
     * @returns {string | undefined}
     */
    get ekey() {
        const ret = wasm.qmcfooter_ekey(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Get size of footer
     * @returns {number}
     */
    get size() {
        const ret = wasm.qmcfooter_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Parse QMC Footer from byte slice.
     *   Recommended to slice the last 1024 bytes of the file.
     * @param {Uint8Array} footer
     * @returns {QMCFooter | undefined}
     */
    static parse(footer) {
        const ptr0 = passArray8ToWasm0(footer, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qmcfooter_parse(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] === 0 ? undefined : QMCFooter.__wrap(ret[0]);
    }
}

const QingTingFMFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_qingtingfm_free(ptr >>> 0, 1));
/**
 * QingTingFM QTA file decipher.
 */
class QingTingFM {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QingTingFMFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_qingtingfm_free(ptr, 0);
    }
    /**
     * @param {string} file_name
     * @returns {Uint8Array}
     */
    static getFileIV(file_name) {
        const ptr0 = passStringToWasm0(file_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qingtingfm_getFileIV(ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @param {string} product
     * @param {string} device
     * @param {string} manufacturer
     * @param {string} brand
     * @param {string} board
     * @param {string} model
     * @returns {Uint8Array}
     */
    static getDeviceKey(product, device, manufacturer, brand, board, model) {
        const ptr0 = passStringToWasm0(product, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(device, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(manufacturer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(brand, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(board, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(model, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.qingtingfm_getDeviceKey(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
        var v7 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v7;
    }
    /**
     * @param {Uint8Array} device_key
     * @param {Uint8Array} file_iv
     */
    constructor(device_key, file_iv) {
        const ptr0 = passArray8ToWasm0(device_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(file_iv, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.qingtingfm_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        QingTingFMFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Decrypt encrypted buffer part.
     * @param {Uint8Array} buffer
     * @param {number} offset
     */
    decrypt(buffer, offset) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.qingtingfm_decrypt(this.__wbg_ptr, ptr0, len0, buffer, offset);
    }
}

const XiamiFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_xiami_free(ptr >>> 0, 1));
/**
 * Xiami XM file decipher.
 */
class Xiami {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Xiami.prototype);
        obj.__wbg_ptr = ptr;
        XiamiFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        XiamiFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_xiami_free(ptr, 0);
    }
    /**
     * Parse the Xiami header (0x400 bytes)
     * @param {Uint8Array} header
     * @returns {Xiami}
     */
    static from_header(header) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.xiami_from_header(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Xiami.__wrap(ret[0]);
    }
    /**
     * After header (0x10 bytes), the number of bytes should be copied without decryption.
     * @returns {number}
     */
    get copyPlainLength() {
        const ret = wasm.xiami_copyPlainLength(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Decrypt encrypted buffer part.
     * @param {Uint8Array} buffer
     */
    decrypt(buffer) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.xiami_decrypt(this.__wbg_ptr, ptr0, len0, buffer);
    }
}

const XmlyPCFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_xmlypc_free(ptr >>> 0, 1));
/**
 * Ximalaya PC Decipher.
 */
class XmlyPC {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        XmlyPCFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_xmlypc_free(ptr, 0);
    }
    /**
     * Get required bytes for the header, or throw error if not valid XM file.
     * @param {Uint8Array} buffer
     * @returns {number}
     */
    static getHeaderSize(buffer) {
        const ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.xmlypc_getHeaderSize(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Get the first few bytes of the header.
     * @returns {Uint8Array}
     */
    get audioHeader() {
        const ret = wasm.xmlypc_audioHeader(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Get the size of encrypted header
     * @returns {number}
     */
    get encryptedHeaderSize() {
        const ret = wasm.xmlypc_encryptedHeaderSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the offset where the encrypted header is
     * @returns {number}
     */
    get encryptedHeaderOffset() {
        const ret = wasm.xmlypc_encryptedHeaderOffset(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Create a new XmlyPC decipher
     * @param {Uint8Array} header
     */
    constructor(header) {
        const ptr0 = passArray8ToWasm0(header, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.xmlypc_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        XmlyPCFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Decrypt encrypted header
     * @param {Uint8Array} buffer
     * @returns {number}
     */
    decrypt(buffer) {
        var ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.xmlypc_decrypt(this.__wbg_ptr, ptr0, len0, buffer);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return ret;
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_copy_to_typed_array = function(arg0, arg1, arg2) {
        new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_3;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module);
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead');
        }
    }

    const imports = __wbg_get_imports();

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path);
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead');
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('um_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

function loader() {
  {
    const url = new URL('um_wasm_bg.wasm', import.meta.url);
    const wasm =
      url.protocol === 'file:'
        ? import(/* @vite-ignore */ 'node:f' + 's/promises')
            .then((fs) => fs.readFile(url))
            .catch((err) => {
              console.log('read wasm failed', err);
            })
        : undefined;
    return __wbg_init({ module_or_path: wasm }).then(() => (initPanicHook(), true));
  }
}

function getUmcVersion() {
  return "0.1.12";
}

const ready = loader();

export { AudioTypeResult, JooxFile, KWMDecipher, KWMDecipherV1, KuGou, KuGouHeader, KuwoHeader, Migu3D, NCMFile, QMC2, QMCFooter, QingTingFM, Xiami, XmlyPC, __wbg_init, decryptQMC1, decryptQRCFile, decryptQRCNetwork, decryptX2MHeader, decryptX3MHeader, detectAudioType, getUmcVersion, initPanicHook, initSync, kuwoBodianCipherFactory, kuwoV2CipherFactory, ready };
