---
name: github-discussion
disable-model-invocation: true
description: 创建、回复、修订、阶段收敛或关闭 GitHub Discussion 时使用。
---

# GitHub Discussion

Discussion 承载还没形成确定工作命题的想法、分歧和待裁决问题；目标与关闭条件已明确的，即使暂不执行也建 Issue。仓库、分类、权限和授权按项目规则。

主判据：**任何人只读正文顶部的路由和它指向的那一条评论，就能拿到当前完整的基线或结论。**

## 正文与方案

正文中立说明共同问题：背景、已确认事实、约束、待回答的问题，可以客观列出已知选项。任何主张、方案和论证都放评论。

独立方案发顶层评论；对它的分析、质疑和修正用 `Reply` 挂在其下；形成新的整体方案再发新顶层评论。代理发的顶层评论首行写 `评论者：<模型ID>`；跨方案引用写 `引用：<comment-id>（<永久链接>）`。

有阶段收敛稿后，新方案链接该版本，只写改变或补充的部分；增量已说不清时重写完整方案。

## 原位修订

原评论有影响结论的事实错误或撤回项时 `Edit`，顶部加：

```md
> **修订：**
> - 撤回：……
> - 原因：……
> - 当前结论：……
```

需要追溯的原主张加删除线保留，长的可折叠。纯文字修正直接改；新证据用 `Reply`。已成为共同基线的阶段收敛稿不改实质结论，发下一版。

## 阶段收敛

一批共同结论需要进入下一轮时，由创建者或用户指定的代理发阶段收敛稿：完整写当前已定内容和仍待讨论的问题，只保留容易被再次提出的已排除方案。它整理共识，不替代仍需授权的裁决。只在共同基线实质变化时出新版本，并 `Edit` 正文顶部为：

```md
> 当前基线：阶段收敛稿 V1（<永久链接>）
```

## 结论与关闭

结论评论自足地写全已收敛的结论、确定裁决、不处理项、仍未确定项和实际落点；读它不需要回看历史评论。支持答案的分类对它 `Mark as answer`。正文顶部只留路由：

```md
> 结论：<结论永久链接>
```

承接 Issue 回链本 Discussion。结论和落点能从时间线直接恢复后 `Close discussion`。

## CLI

`gh discussion` 是预览命令，先看本机 `gh discussion --help`；正文从文件读，评论永久链接加引号。

创建、顶层评论、`Reply` 和原位 `Edit`：

```bash
gh discussion create -R OWNER/REPO --category CATEGORY --title 'TITLE' --body-file body.md
gh discussion comment DISCUSSION_URL --body-file comment.md
gh discussion comment 'COMMENT_URL' --body-file reply.md
gh discussion edit DISCUSSION_URL --body-file body.md
gh discussion comment 'COMMENT_URL' --edit --body-file comment.md
```

`comment` 的参数是 Discussion 时创建顶层评论，是评论 URL / node ID 时创建回复；原位修改必须加 `--edit`。文件正文仍须满足上文评论头部和修订格式。

需要 GraphQL node ID 时查询顶层评论；`--paginate` 必须声明 `$endCursor` 并返回 `pageInfo`，此分页不包含回复：

```bash
gh api graphql --paginate \
  -F owner=OWNER -F repo=REPO -F number=DISCUSSION_NUMBER \
  -f query='query($owner:String!,$repo:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$repo){discussion(number:$number){id category{isAnswerable} comments(first:100,after:$endCursor){nodes{id databaseId url} pageInfo{hasNextPage endCursor}}}}}'
```

`Mark as answer` 只用于支持答案的分类；它使用 comment node ID，关闭使用 discussion node ID，不能以 `databaseId` 代替：

```bash
gh api graphql -F id=COMMENT_NODE_ID \
  -f query='mutation($id:ID!){markDiscussionCommentAsAnswer(input:{id:$id}){discussion{id url}}}'

gh api graphql -F discussionId=DISCUSSION_NODE_ID -F reason=RESOLVED \
  -f query='mutation($discussionId:ID!,$reason:DiscussionCloseReason){closeDiscussion(input:{discussionId:$discussionId,reason:$reason}){discussion{id url closed}}}'
```

每次写入后按返回 URL 重查正文及状态，核对目标与结果：

```bash
gh discussion view DISCUSSION_URL --json id,url,body,category,closed,answered
gh discussion view 'COMMENT_URL' --json comments
```

评论正文位于 `comments.nodes` 中的目标评论；JSON 顶层 `body` 是 Discussion 正文。来源：[CLI 命令](https://cli.github.com/manual/gh_discussion)、[文件读取与分页](https://cli.github.com/manual/gh_api)、[Discussion GraphQL API](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)。
