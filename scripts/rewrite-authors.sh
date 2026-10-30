#!/bin/sh
# 把仓库里所有提交的作者/提交者统一改成 AnJianhe 的 GitHub noreply 邮箱，
# 这样 GitHub Contributors 只会显示 AnJianhe，而不是邮箱对应的陌生账号。
set -e
cd "$(dirname "$0")/.."

git filter-branch -f --env-filter '
export GIT_AUTHOR_NAME="AnJianhe"
export GIT_AUTHOR_EMAIL="220304259+AnJianhe@users.noreply.github.com"
export GIT_COMMITTER_NAME="AnJianhe"
export GIT_COMMITTER_EMAIL="220304259+AnJianhe@users.noreply.github.com"
' --tag-name-filter cat -- --branches --tags

echo "--- rewritten log ---"
git log --format="%h | %an <%ae>" -5
