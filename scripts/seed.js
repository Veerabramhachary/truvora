"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDynamicCategories = void 0;
var db_1 = require("@/db");
var schema_1 = require("../db/schema/schema");
var drizzle_orm_1 = require("drizzle-orm");
// Import the arrays from your categories file
// Adjust the path to where your categories.ts file is actually located
var categories_1 = require("./categories");
var seedDynamicCategories = function () { return __awaiter(void 0, void 0, void 0, function () {
    var allCategoryGroups_1, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                console.log("Starting dynamic category seed to Neon DB...");
                allCategoryGroups_1 = __spreadArray(__spreadArray(__spreadArray([], categories_1.expenseCategories, true), categories_1.incomeCategories, true), categories_1.subscriptionsCategories, true);
                return [4 /*yield*/, db_1.db.transaction(function (tx) { return __awaiter(void 0, void 0, void 0, function () {
                        var _loop_1, _i, allCategoryGroups_2, group;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    console.log("Transaction started...");
                                    _loop_1 = function (group) {
                                        var parentName, childValues;
                                        return __generator(this, function (_b) {
                                            switch (_b.label) {
                                                case 0:
                                                    parentName = group.label;
                                                    console.log("Processing parent category: ".concat(parentName));
                                                    // 1. Upsert the Parent Category
                                                    return [4 /*yield*/, tx
                                                            .insert(schema_1.categories)
                                                            .values({
                                                            name: parentName,
                                                            icon: "📁", // Default icon (since categories.ts doesn't have them)
                                                            color: "#6366f1", // Default color
                                                            userId: null, // Global category
                                                            parentName: null,
                                                        })
                                                            .onConflictDoUpdate({
                                                            target: schema_1.categories.name, // Requires UNIQUE constraint on 'name'
                                                            set: {
                                                                name: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["excluded.name"], ["excluded.name"
                                                                    // Not overwriting icon/color here so manual DB edits aren't wiped out
                                                                ])))
                                                                // Not overwriting icon/color here so manual DB edits aren't wiped out
                                                            },
                                                        })];
                                                case 1:
                                                    // 1. Upsert the Parent Category
                                                    _b.sent();
                                                    childValues = group.items.map(function (item) { return ({
                                                        name: item.label, // Using the human-readable label
                                                        icon: "📄", // Default child icon
                                                        color: "#9ca3af", // Default child color
                                                        userId: null,
                                                        parentName: parentName, // Link to the parent we just created
                                                    }); });
                                                    if (!(childValues.length > 0)) return [3 /*break*/, 3];
                                                    return [4 /*yield*/, tx
                                                            .insert(schema_1.categories)
                                                            .values(childValues)
                                                            .onConflictDoUpdate({
                                                            target: schema_1.categories.name,
                                                            set: {
                                                                parentName: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["excluded.parent_name"], ["excluded.parent_name"]))),
                                                                // Not overwriting icon/color automatically
                                                            },
                                                        })];
                                                case 2:
                                                    _b.sent();
                                                    console.log("  -> Inserted/Updated ".concat(childValues.length, " items for ").concat(parentName));
                                                    _b.label = 3;
                                                case 3: return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _i = 0, allCategoryGroups_2 = allCategoryGroups_1;
                                    _a.label = 1;
                                case 1:
                                    if (!(_i < allCategoryGroups_2.length)) return [3 /*break*/, 4];
                                    group = allCategoryGroups_2[_i];
                                    return [5 /*yield**/, _loop_1(group)];
                                case 2:
                                    _a.sent();
                                    _a.label = 3;
                                case 3:
                                    _i++;
                                    return [3 /*break*/, 1];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); })];
            case 1:
                _a.sent();
                console.log("✅ Transaction completed! Categories successfully seeded to Neon DB.");
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                console.error("❌ Error during category update:", error_1);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.seedDynamicCategories = seedDynamicCategories;
(0, exports.seedDynamicCategories)().catch(console.error);
var templateObject_1, templateObject_2;
