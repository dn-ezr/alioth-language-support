"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
//import Uri from "vscode-uri";
const vscode_languageserver_1 = require("vscode-languageserver");
const path = require("path");
const child_process_1 = require("child_process");
const os = require("os");
const fs = require("fs");
const vscode_uri_1 = require("vscode-uri");
// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = vscode_languageserver_1.createConnection(vscode_languageserver_1.ProposedFeatures.all);
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents = new vscode_languageserver_1.TextDocuments();
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
connection.onInitialize((params) => {
    let capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability =
        !!(capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation);
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            // Tell the client that the server supports code completion
            completionProvider: {
                resolveProvider: true
            }
        }
    };
});
connection.onInitialized(() => __awaiter(this, void 0, void 0, function* () {
    initializeCompiler();
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(vscode_languageserver_1.DidChangeConfigurationNotification.type, undefined);
        // getAliothSettings();
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
    connection.console.info("Alioth Language Server started.");
}));
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings = { logCompilerPackage: false, workSpaceUri: "./" };
let globalSettings = defaultSettings;
let windowSetting = undefined;
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        windowSetting = undefined;
        getAliothSettings();
    }
    else {
        globalSettings = ((change.settings.AliothLanguageServer || defaultSettings));
    }
});
connection.onShutdown(() => {
    if (compiler) {
        requestExit();
        compiler = undefined;
    }
});
connection.onExit(() => {
    if (compiler) {
        requestExit();
        compiler = undefined;
    }
});
function getAliothSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!hasConfigurationCapability) {
            return globalSettings;
        }
        if (!windowSetting) {
            windowSetting = connection.workspace.getConfiguration({
                scopeUri: "window",
                section: 'AliothLanguageServer'
            });
            windowSetting.then((setting) => {
                if (setting.logCompilerPackage) {
                    connection.console.info("Configuration: logCompilerPackage : true");
                }
                workspace_set = false;
                validateDocuments(null);
            });
        }
        return windowSetting;
    });
}
// Only keep settings for open documents
documents.onDidClose(e => {
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
// documents.onDidOpen(validateDocuments);
// documents.onDidSave(validateDocuments);
documents.onDidChangeContent(validateDocuments);
connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received an file change event');
});
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition) => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
        {
            label: 'TypeScript',
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            data: 1
        },
        {
            label: 'JavaScript',
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            data: 2
        }
    ];
});
// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    if (item.data === 1) {
        (item.detail = 'TypeScript details'),
            (item.documentation = 'TypeScript documentation');
    }
    else if (item.data === 2) {
        (item.detail = 'JavaScript details'),
            (item.documentation = 'JavaScript documentation');
    }
    return item;
});
// the connection to the compiler
let compiler = undefined;
function initializeCompiler() {
    compiler = child_process_1.spawn("alioth", ["v:", "1", "---", "0/1"]);
    compiler.stdout.on("data", onCompilerOutput);
    compiler.on("close", (code, signal) => {
        connection.console.warn("Compiler exited:(" + code + "):" + signal);
        compiler = undefined;
    });
    connection.console.info("Compiler started in interactive mode");
}
function onCompilerOutput(message) {
    return __awaiter(this, void 0, void 0, function* () {
        let setting = yield getAliothSettings();
        message = message.toString().trimRight();
        if (setting.logCompilerPackage) {
            connection.console.info("compiler package received: " + message);
        }
        let msg = null;
        try {
            msg = JSON.parse(message);
            if (msg === null || typeof msg !== 'object') {
                return;
            }
        }
        catch (_a) {
            return;
        }
        if (msg.action === "request") {
            processRequest(msg);
        }
        else if (msg.action === "respond") {
            processRespond(msg);
        }
    });
}
function processRequest(request) {
    return __awaiter(this, void 0, void 0, function* () {
        if (request.title === "content") {
            let uri = request.uri;
            let doc = documents.get(uri);
            if (doc === undefined) {
                respondFailure(request);
                return;
            }
            else {
                respondContent(request.seq, doc.getText());
            }
        }
        else if (request.title === "contents") {
            let data = {};
            let cur_time = os.uptime();
            let dir_path = vscode_uri_1.default.parse(request.uri).fsPath;
            let ents = fs.readdirSync(dir_path, { withFileTypes: true });
            for (let ent of ents) {
                let obj = {};
                if (ent.isDirectory()) {
                    obj["dir"] = true;
                }
                else {
                    obj["dir"] = false;
                    let file_path = path.join(dir_path, ent.name);
                    let doc = documents.get(vscode_uri_1.default.file(file_path).toString());
                    if (doc === undefined) {
                        let st = fs.statSync(file_path);
                        obj["size"] = st.size;
                        obj["mtime"] = st.mtime.getTime();
                    }
                    else {
                        obj["size"] = 1;
                        obj["mtime"] = cur_time;
                    }
                }
                data[ent.name] = obj;
            }
            respondContents(request.seq, data);
        }
        else {
            return;
        }
    });
}
function processRespond(respond) {
    if (respond.title === "diagnostics") {
        if (Array.isArray(respond.diagnostics)) {
            diagnosticsProcesser(respond.diagnostics);
        }
    }
    else if (respond.title === "exception") {
        connection.console.error("compiler exception: " + respond.msg);
    }
    else {
        return;
    }
}
function requestDiagnostics(targets = []) {
    let pack = {
        title: "diagnostics",
        targets: targets
    };
    return sendRequest(pack);
}
function requestWorkspace(uri_or_path) {
    let uri = undefined;
    let parsed = vscode_uri_1.default.parse(uri_or_path);
    if (parsed && parsed.scheme.length > 0) {
        uri = parsed;
    }
    else {
        uri = vscode_uri_1.default.file(path.resolve(uri_or_path));
    }
    connection.console.info("Configuration: worksapace : " + uri.toString());
    let pack = {
        title: "workspace",
        uri: uri.toString()
    };
    return sendRequest(pack);
}
function requestExit() {
    let pack = {
        title: "exit"
    };
    return sendRequest(pack);
}
function respondContent(seq, data) {
    let pack = {
        title: "content",
        status: 0,
        data: data
    };
    sendRespond(seq, pack);
}
function respondContents(seq, data) {
    let pack = {
        title: "contents",
        status: 0,
        data: data
    };
    sendRespond(seq, pack);
}
function respondFailure(request) {
    let pack = {
        title: request.title,
        status: 1
    };
    sendRespond(request.seq, pack);
}
let global_req = 1;
function sendRequest(pack) {
    pack.action = "request";
    pack.seq = global_req++;
    sendPackage(pack);
    return pack.seq;
}
function sendRespond(seq, pack) {
    pack.action = "respond";
    pack.seq = seq;
    sendPackage(pack);
}
function sendPackage(pack) {
    return __awaiter(this, void 0, void 0, function* () {
        pack.timestamp = os.uptime();
        let str = JSON.stringify(pack);
        let setting = yield getAliothSettings();
        if (compiler) {
            compiler.stdin.write(str + "\n", (e) => { });
            if (setting.logCompilerPackage) {
                connection.console.info("compiler package sent: " + str);
            }
        }
        else {
            connection.console.error("failed to send package to compiler: " + str);
        }
    });
}
let workspace_set = false;
function validateDocuments(change) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!workspace_set) {
            workspace_set = true;
            let setting = yield getAliothSettings();
            requestWorkspace(setting.workSpaceUri);
        }
        requestDiagnostics();
    });
}
let diagnosticsMap = {};
function diagnosticsProcesser(log) {
    for (let key in diagnosticsMap) {
        diagnosticsMap[key] = [];
    }
    for (let element of log) {
        let diagnostics = diagnosticsMap[element.prefix];
        if (diagnostics === undefined) {
            diagnostics = diagnosticsMap[element.prefix] = [];
        }
        let diagnostic = translateDiagnostic(element);
        diagnostics.push(diagnostic);
    }
    // Send the computed diagnostics to VSCode.
    for (let key in diagnosticsMap) {
        connection.sendDiagnostics({ uri: key, diagnostics: diagnosticsMap[key] });
    }
}
function translateDiagnostic(diagnostic) {
    let d = {
        severity: diagnostic.severity,
        range: {
            start: vscode_languageserver_1.Position.create((diagnostic.begin_line -= 1) < 0 ? 0 : diagnostic.begin_line, (diagnostic.begin_column -= 1) < 0 ? 0 : diagnostic.begin_column),
            end: vscode_languageserver_1.Position.create((diagnostic.end_line -= 1) < 0 ? 0 : diagnostic.end_line, (diagnostic.end_column -= 1) < 0 ? 0 : diagnostic.end_column)
        },
        message: diagnostic.message,
        source: 'alioth'
    };
    if (hasDiagnosticRelatedInformationCapability) {
        d.relatedInformation = [];
        for (let sub of diagnostic.informations) {
            let subd = {
                location: {
                    uri: sub.prefix,
                    range: {
                        start: vscode_languageserver_1.Position.create((sub.begin_line -= 1) < 0 ? 0 : sub.begin_line, (sub.begin_column -= 1) < 0 ? 0 : sub.begin_column),
                        end: vscode_languageserver_1.Position.create((sub.end_line -= 1) < 0 ? 0 : sub.end_line, (sub.end_column -= 1) < 0 ? 0 : sub.end_column)
                    }
                },
                message: sub.message
            };
            d.relatedInformation.push(subd);
        }
    }
    return d;
}
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map