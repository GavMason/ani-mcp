# ani-mcp

A smart [MCP](https://modelcontextprotocol.io) server for [AniList](https://anilist.co) that understands your anime and manga taste - not just raw API calls.

## What makes this different

Most AniList integrations mirror the API 1:1. ani-mcp adds an intelligence layer on top:

- **Taste profiling** - builds a model of your preferences from your completed list
- **Personalized picks** - "what should I watch next?" based on your taste and mood
- **Compatibility** - compare taste between two users
- **Year in review** - your watching/reading stats wrapped up

Plus the essentials: search, details, trending, seasonal browsing, list management, and community recommendations. All search and browse tools support pagination for browsing beyond the first page of results.

## Install

Add to your MCP client config (e.g. `mcp.json`, `claude_desktop_config.json`, Cursor settings, etc.):

```json
{
  "mcpServers": {
    "anilist": {
      "command": "npx",
      "args": ["-y", "ani-mcp"],
      "env": {
        "ANILIST_USERNAME": "your_username"
      }
    }
  }
}
```

Works with any MCP-compatible client.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `ANILIST_USERNAME` | No | Default username for list and stats tools. Can also pass per-call. |
| `ANILIST_TOKEN` | No | AniList OAuth token. Required for write operations and private lists. |
| `DEBUG` | No | Set to `true` for debug logging to stderr. |
| `MCP_TRANSPORT` | No | Set to `http` for HTTP Stream transport. Default: stdio. |
| `MCP_PORT` | No | Port for HTTP transport. Default: `3000`. |
| `MCP_HOST` | No | Host for HTTP transport. Default: `localhost`. |

## Tools

### Search & Discovery

| Tool | Description |
| --- | --- |
| `anilist_search` | Search anime/manga by title with genre, year, and format filters |
| `anilist_details` | Full details, relations, and recommendations for a title |
| `anilist_seasonal` | Browse a season's anime lineup |
| `anilist_trending` | What's trending on AniList right now |
| `anilist_genres` | Browse top titles in a genre with optional filters |
| `anilist_recommendations` | Community recommendations for a specific title |

### Lists & Stats

| Tool | Description |
| --- | --- |
| `anilist_list` | A user's anime/manga list, filtered by status |
| `anilist_stats` | Watching/reading statistics, top genres, score distribution |

### Intelligence

| Tool | Description |
| --- | --- |
| `anilist_taste` | Generate a taste profile from your completed list |
| `anilist_pick` | Personalized "what to watch next" based on taste and mood |
| `anilist_compare` | Compare taste compatibility between two users |
| `anilist_wrapped` | Year-in-review summary |
| `anilist_explain` | "Why would I like this?" - score a title against your taste profile |
| `anilist_similar` | Find titles similar to a given anime or manga |

### Info

| Tool | Description |
| --- | --- |
| `anilist_staff` | Staff credits and voice actors for a title |
| `anilist_staff_search` | Search for a person by name and see all their works |
| `anilist_studio_search` | Search for a studio and see their productions |
| `anilist_schedule` | Airing schedule and next episode countdown |
| `anilist_characters` | Search characters by name with appearances and VAs |

### Write (requires `ANILIST_TOKEN`)

| Tool | Description |
| --- | --- |
| `anilist_update_progress` | Update episode or chapter progress |
| `anilist_add_to_list` | Add a title to your list with a status |
| `anilist_rate` | Score a title (0-10) |
| `anilist_delete_from_list` | Remove an entry from your list |

## Docker

```sh
docker build -t ani-mcp .
docker run -e ANILIST_USERNAME=your_username ani-mcp
```

Runs on port 3000 with HTTP Stream transport by default.

## Build from Source

```sh
git clone https://github.com/gavxm/ani-mcp.git
cd ani-mcp
npm install
npm run build
npm test
```

## License

MIT
