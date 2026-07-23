/// <reference path="../pb_data/types.d.ts" />
/**
 * Adds HIDDEN TOTP fields to users (totpSecret/totpEnabled/totpBackup) — hidden
 * so they can never be read or written through the public record API; only the
 * server-side 2FA endpoints touch them. Also carries the owner-scoped viewRule.
 */
migrate((app) => {
  const snapshot = [
{
  "id": "_pb_users_auth_",
  "listRule": "id = @request.auth.id",
  "viewRule": "id = @request.auth.id",
  "createRule": "",
  "updateRule": "id = @request.auth.id",
  "deleteRule": "id = @request.auth.id",
  "name": "users",
  "type": "auth",
  "fields": [
    {
      "autogeneratePattern": "[a-z0-9]{15}",
      "help": "",
      "hidden": false,
      "id": "text3208210256",
      "max": 15,
      "min": 15,
      "name": "id",
      "pattern": "^[a-z0-9]+$",
      "presentable": false,
      "primaryKey": true,
      "required": true,
      "system": true,
      "type": "text"
    },
    {
      "cost": 0,
      "help": "",
      "hidden": true,
      "id": "password901924565",
      "max": 0,
      "min": 8,
      "name": "password",
      "pattern": "",
      "presentable": false,
      "required": true,
      "system": true,
      "type": "password"
    },
    {
      "autogeneratePattern": "[a-zA-Z0-9]{50}",
      "help": "",
      "hidden": true,
      "id": "text2504183744",
      "max": 60,
      "min": 30,
      "name": "tokenKey",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": true,
      "system": true,
      "type": "text"
    },
    {
      "exceptDomains": null,
      "help": "",
      "hidden": false,
      "id": "email3885137012",
      "name": "email",
      "onlyDomains": null,
      "presentable": false,
      "required": true,
      "system": true,
      "type": "email"
    },
    {
      "help": "",
      "hidden": false,
      "id": "bool1547992806",
      "name": "emailVisibility",
      "presentable": false,
      "required": false,
      "system": true,
      "type": "bool"
    },
    {
      "help": "",
      "hidden": false,
      "id": "bool256245529",
      "name": "verified",
      "presentable": false,
      "required": false,
      "system": true,
      "type": "bool"
    },
    {
      "autogeneratePattern": "",
      "help": "",
      "hidden": false,
      "id": "text1579384326",
      "max": 0,
      "min": 0,
      "name": "name",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    },
    {
      "help": "",
      "hidden": false,
      "id": "file376926767",
      "maxSelect": 1,
      "maxSize": 0,
      "mimeTypes": [
        "image/jpeg",
        "image/png",
        "image/svg+xml",
        "image/gif",
        "image/webp"
      ],
      "name": "avatar",
      "presentable": false,
      "protected": false,
      "required": false,
      "system": false,
      "thumbs": null,
      "type": "file"
    },
    {
      "help": "",
      "hidden": false,
      "id": "json1859712608",
      "maxSize": 0,
      "name": "appData",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    },
    {
      "autogeneratePattern": "",
      "help": "",
      "hidden": false,
      "id": "text596812118",
      "max": 0,
      "min": 0,
      "name": "firstName",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    },
    {
      "autogeneratePattern": "",
      "help": "",
      "hidden": false,
      "id": "text2434144904",
      "max": 0,
      "min": 0,
      "name": "lastName",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    },
    {
      "help": "",
      "hidden": false,
      "id": "number1146066909",
      "max": null,
      "min": null,
      "name": "phone",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    },
    {
      "hidden": false,
      "id": "autodate2990389176",
      "name": "created",
      "onCreate": true,
      "onUpdate": false,
      "presentable": false,
      "system": false,
      "type": "autodate"
    },
    {
      "hidden": false,
      "id": "autodate3332085495",
      "name": "updated",
      "onCreate": true,
      "onUpdate": true,
      "presentable": false,
      "system": false,
      "type": "autodate"
    },
    {
      "id": "text1000000001",
      "name": "totpSecret",
      "type": "text",
      "hidden": true,
      "max": 0,
      "min": 0,
      "pattern": "",
      "required": false,
      "system": false,
      "presentable": false,
      "primaryKey": false,
      "autogeneratePattern": ""
    },
    {
      "id": "bool1000000002",
      "name": "totpEnabled",
      "type": "bool",
      "hidden": true,
      "required": false,
      "system": false,
      "presentable": false
    },
    {
      "id": "json1000000003",
      "name": "totpBackup",
      "type": "json",
      "hidden": true,
      "maxSize": 0,
      "required": false,
      "system": false,
      "presentable": false
    }
  ],
  "indexes": [
    "CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)",
    "CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''"
  ],
  "system": false,
  "authRule": "",
  "manageRule": null,
  "authAlert": {
    "enabled": true,
    "emailTemplate": {
      "subject": "Login from a new location",
      "body": "<p>Hello,</p>\n<p>We noticed a login to your {APP_NAME} account from a new location:</p>\n<p><em>{ALERT_INFO}</em></p>\n<p><strong>If this wasn't you, you should immediately change your {APP_NAME} account password to revoke access from all other locations.</strong></p>\n<p>If this was you, you may disregard this email.</p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>"
    }
  },
  "oauth2": {
    "mappedFields": {
      "id": "",
      "name": "name",
      "username": "",
      "avatarURL": "avatar"
    },
    "enabled": false
  },
  "passwordAuth": {
    "enabled": true,
    "identityFields": [
      "email"
    ]
  },
  "mfa": {
    "enabled": false,
    "duration": 1800,
    "rule": ""
  },
  "otp": {
    "enabled": false,
    "duration": 180,
    "length": 8,
    "emailTemplate": {
      "subject": "OTP for {APP_NAME}",
      "body": "<p>Hello,</p>\n<p>Your one-time password is: <strong>{OTP}</strong></p>\n<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>"
    }
  },
  "authToken": {
    "duration": 604800
  },
  "passwordResetToken": {
    "duration": 1800
  },
  "emailChangeToken": {
    "duration": 1800
  },
  "verificationToken": {
    "duration": 259200
  },
  "fileToken": {
    "duration": 180
  },
  "verificationTemplate": {
    "subject": "Verify your {APP_NAME} email",
    "body": "<p>Hello,</p>\n<p>Thank you for joining us at {APP_NAME}.</p>\n<p>Click on the button below to verify your email address.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Verify</a>\n</p>\n<p><i>If you didn't recently register, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>"
  },
  "resetPasswordTemplate": {
    "subject": "Reset your {APP_NAME} password",
    "body": "<p>Hello,</p>\n<p>Click on the button below to reset your password.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/?reset={TOKEN}\" target=\"_blank\" rel=\"noopener\">Reset password</a>\n</p>\n<p>If you didn't request this, you can safely ignore this email.</p>\n<p>Thanks,<br/>{APP_NAME} team</p>"
  },
  "confirmEmailChangeTemplate": {
    "subject": "Confirm your {APP_NAME} new email address",
    "body": "<p>Hello,</p>\n<p>Click on the button below to confirm your new email address.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Confirm new email</a>\n</p>\n<p><i>If you didn't ask to change your email address, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>"
  }
}
  ];
  app.importCollections(snapshot, false);
}, (app) => {});
