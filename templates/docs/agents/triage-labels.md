# Triage 标签参数

`triage` 的角色到标签映射。缺省时角色名就是标签名。

| Triage 角色 | 本项目标签 |
|---|---|
| `bug` | `bug` |
| `enhancement` | `enhancement` |
| `needs-triage` | `status:triage` |
| `needs-info` | `status:waiting`，评论写等待条件 |
| `ready-for-agent` | `status:backlog`；立卡后 `status:tasked` |
| `ready-for-human` | `status:waiting`，评论写需要谁做什么 |
| `wontfix` | 不打标签，评论原因后以 `not planned` 关闭 |

Wayfinder 标签：`wayfinder:map`、`wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling`、`wayfinder:task`。
