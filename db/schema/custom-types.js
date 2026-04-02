"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptedJson = exports.encryptedText = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var encryption_1 = require("../utils/encryption");
exports.encryptedText = (0, pg_core_1.customType)({
    dataType: function () {
        return "text";
    },
    toDriver: function (value) {
        if (value === null)
            return null;
        return (0, encryption_1.encrypt)(value);
    },
    fromDriver: function (value) {
        if (value === null)
            return null;
        if (typeof value !== "string") {
            throw new Error("Expected string from database");
        }
        return (0, encryption_1.decrypt)(value);
    },
});
var encryptedJson = function () {
    return (0, pg_core_1.customType)({
        dataType: function () {
            return "text";
        },
        toDriver: function (value) {
            if (value === null)
                return null;
            // Convert the object/array to a string before encrypting
            return (0, encryption_1.encrypt)(JSON.stringify(value));
        },
        fromDriver: function (value) {
            if (value === null)
                return null;
            if (typeof value !== "string") {
                throw new Error("Expected encrypted string from database");
            }
            var decrypted = (0, encryption_1.decrypt)(value);
            // Parse the decrypted string back into a JSON object
            return JSON.parse(decrypted);
        },
    });
};
exports.encryptedJson = encryptedJson;
