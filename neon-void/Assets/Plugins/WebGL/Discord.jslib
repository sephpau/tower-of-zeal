mergeInto(LibraryManager.library, {
  NVDiscordAvailable: function () {
    return (window.NVDiscordAvailable && window.NVDiscordAvailable()) ? 1 : 0;
  },
  NVDiscordGetUser: function () {
    var s = (window.NVDiscordUser && window.NVDiscordUser()) || "";
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
  },
  NVDiscordLogin: function () {
    if (window.NVDiscordLogin) window.NVDiscordLogin();
  },
  NVDiscordLogout: function () {
    if (window.NVDiscordLogout) window.NVDiscordLogout();
  }
});
