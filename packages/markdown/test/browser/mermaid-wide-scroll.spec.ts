/**
 * Nested architecture flowcharts are native-width (useMaxWidth: false).
 * The fence must scroll that SVG inside the column. If the fence grows to
 * the SVG, the note widens and the pane clips subgraphs and arrows.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const TOPOLOGY = `flowchart LR
  player(["玩家客户端"]) -->|"HTTPS :30006/30007/..."| clb["公网 CLB<br/>每个 zone 独立端口"]
  subgraph env["一个环境（如 china/dev → namespace: development）"]
    subgraph zone["Unit: zone_1 / zone_2 / zone_3（每个 zone 一套独立业务栈）"]
      gw["gatewaysvr<br/>玩家入口 / 鉴权 / 限流"] -->|"Mesh RPC"| act["activitysvr<br/>活动核心逻辑"]
      gw -->|"Mesh RPC"| gm["gmsvr<br/>GM 指令（仅测试）"]
      act <-->|"Mesh RPC"| gm
      act -->|"Mesh RPC"| db["dbsvr<br/>数据访问代理"]
      api["apitestsvr<br/>Web 测试台（仅测试）"] -->|"HTTP"| gw
    end
    subgraph share["Unit: share（本环境所有 zone 共用一套锁服务）"]
      dl["dlocksvr"] --> dls["dlockstoresvr"]
    end
    etcd[("Unit: etcd<br/>Mesh 注册与发现中心")]
    act -->|"Mesh RPC"| dl
  end
  clb -->|"NodePort"| gw
  db --> tcaplus[("TcaplusDB<br/>玩家持久化数据")]
  gw -->|"HTTP 登录态校验"| idip["idipsvr（DServer）"]
  act -->|"HTTP 发奖 / 查进度"| idip
  zone -. "注册节点 & watch 路由" .-> etcd
  share -. "注册节点 & watch 路由" .-> etcd`;

const PANORAMA = `flowchart TB
  subgraph src_repo["源码仓 DFActivitySystem"]
    src_push["push 分支 / tag"] --> ci_build["① 上云构建流水线<br/>(.ci/cloud-k8s.yml)"]
  end
  ci_build -->|"推送 <svc>:ci-<sha> / release-<tag>"| reg_svc[("镜像仓库<br/>dfactivitysystem/<svc>")]
  subgraph deploy_repo["部署仓 dfactivitysystem_deploy（本仓 .ci/）"]
    console_submit["管理台提交操作"] -->|"蓝盾 API 启动"| ci_release["② 部署仓操作流水线<br/>(.ci/release.yml · dfrelease)"]
    ci_release -->|"工蜂 API 建 release/<单号> 与 MR"| mr["工蜂 MR → master"]
    hand_mr["开发者手改 values/ + make render"] --> mr
    mr -->|"触发门禁"| ci_check["③ 部署仓检查流水线<br/>(.ci/check.yml · dfci check + image-check)"]
    reg_svc -. "crane 提取模板校验缺键" .-> ci_check
    mr -->|"人工审阅合入"| master["master 分支"]
    master -->|"改动 values/ 或 rendered/"| ci_snap["④ 部署仓快照流水线<br/>(.ci/snapshot.yml · dfci snapshot)"]
    master -->|"改动 web_console/"| ci_web["⑤ Web控制台流水线<br/>(.ci/web-console.yml)"]
  end
  ci_snap -->|"crane push OCI artifact"| reg_snap[("镜像仓库<br/>deploy-snapshot:master")]
  ci_web -->|"构建并推送"| reg_console[("镜像仓库<br/>dfactivitycloud:console-<sha12>")]
  reg_snap -. "每 10s HEAD 轮询读取" .-> console_submit
  reg_svc -. "查构建对应的镜像 digest" .-> console_submit`;

function note(): string {
  return `# Deploy

\`\`\`mermaid
flowchart LR
  A[Start] --> B[Done]
\`\`\`

## topology

\`\`\`mermaid
${TOPOLOGY}
\`\`\`

## panorama

\`\`\`mermaid
${PANORAMA}
\`\`\`
`;
}

interface Fit {
  svgWidth: number;
  svgHeight: number;
  preClientWidth: number;
  preScrollWidth: number;
  preClientHeight: number;
  scrollerClientWidth: number;
  scrollerScrollWidth: number;
  rightmostInPane: boolean;
  leftmostInPane: boolean;
  svgInsidePre: boolean;
  filter: string;
}

async function reveal(page: Page, needle: string) {
  await page.evaluate((needle) => {
    window.harness.reveal(window.harness.text.indexOf(needle));
  }, needle);
}

async function fitAt(page: Page, needle: string): Promise<Fit> {
  return page.evaluate((needle) => {
    const pre = [
      ...document.querySelectorAll('pre[data-fence="mermaid"]'),
    ].find((item) =>
      decodeURIComponent(item.getAttribute("data-source") || "").includes(
        needle,
      ),
    );
    const svg = pre?.querySelector("svg");
    const scroller = document.querySelector(".cm-scroller");
    if (!pre || !svg || !scroller || svg.querySelector(".node") === null) {
      return {
        svgWidth: 0,
        svgHeight: 0,
        preClientWidth: 0,
        preScrollWidth: 0,
        preClientHeight: 0,
        scrollerClientWidth: 0,
        scrollerScrollWidth: 0,
        rightmostInPane: false,
        leftmostInPane: false,
        svgInsidePre: false,
        filter: "",
      };
    }
    const pane = scroller.getBoundingClientRect();
    const host = pre.getBoundingClientRect();
    const nodes = [...svg.querySelectorAll(".node")].map((node) => ({
      box: node.getBoundingClientRect(),
    }));
    const seen = (box: DOMRect) =>
      box.width > 8 &&
      box.right > pane.left + 1 &&
      box.left < pane.right - 1 &&
      box.bottom > pane.top + 1 &&
      box.top < pane.bottom - 1;
    const first = nodes[0];
    if (!first) {
      return {
        svgWidth: 0,
        svgHeight: 0,
        preClientWidth: 0,
        preScrollWidth: 0,
        preClientHeight: 0,
        scrollerClientWidth: 0,
        scrollerScrollWidth: 0,
        rightmostInPane: false,
        leftmostInPane: false,
        svgInsidePre: false,
        filter: "",
      };
    }
    const leftmost = nodes.reduce(
      (best, node) => (node.box.left < best.box.left ? node : best),
      first,
    );
    const rightmost = nodes.reduce(
      (best, node) => (node.box.right > best.box.right ? node : best),
      first,
    );
    const svgBox = svg.getBoundingClientRect();
    return {
      svgWidth: svgBox.width,
      svgHeight: svgBox.height,
      preClientWidth: pre.clientWidth,
      preScrollWidth: pre.scrollWidth,
      preClientHeight: pre.clientHeight,
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
      rightmostInPane: leftmost ? seen(rightmost!.box) : false,
      leftmostInPane: leftmost ? seen(leftmost.box) : false,
      svgInsidePre:
        svgBox.left >= host.left - 2 &&
        svgBox.right <= host.right + 2 &&
        svgBox.top >= host.top - 2 &&
        svgBox.bottom <= host.bottom + 2,
      filter: getComputedStyle(svg).filter,
    };
  }, needle);
}

test("a small flowchart stays its native size", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await open(
    page,
    "```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```\n\nafter\n",
  );
  await reveal(page, "after");
  await expect
    .poll(() => fitAt(page, "A[Start]"), { timeout: 15000 })
    .toMatchObject({ leftmostInPane: true, svgInsidePre: true });
  const small = await fitAt(page, "A[Start]");
  expect(small.svgWidth, JSON.stringify(small)).toBeGreaterThan(200);
  expect(small.svgWidth).toBeLessThan(500);
  expect(small.preScrollWidth).toBeLessThanOrEqual(small.preClientWidth + 4);
  expect(small.filter).toContain("invert");
  expect(small.scrollerScrollWidth).toBeLessThan(
    small.scrollerClientWidth + 48,
  );
});

test("large flowcharts scroll inside the column", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await open(page, note());
  await expect
    .poll(async () => (await fitAt(page, "玩家客户端")).svgWidth, {
      timeout: 15000,
    })
    .toBeGreaterThan(2000);
  const wide = await fitAt(page, "玩家客户端");
  expect(wide.leftmostInPane, JSON.stringify(wide)).toBe(true);
  expect(wide.svgWidth, JSON.stringify(wide)).toBeGreaterThan(2000);
  expect(wide.preClientWidth).toBeLessThanOrEqual(wide.scrollerClientWidth);
  expect(wide.preScrollWidth).toBeGreaterThan(wide.preClientWidth + 400);
  expect(wide.scrollerScrollWidth).toBeLessThan(wide.scrollerClientWidth + 48);
  expect(wide.rightmostInPane).toBe(false);
  expect(wide.svgInsidePre).toBe(false);

  await page.evaluate(() => {
    const pre = [
      ...document.querySelectorAll('pre[data-fence="mermaid"]'),
    ].find((item) =>
      decodeURIComponent(item.getAttribute("data-source") || "").includes(
        "玩家客户端",
      ),
    );
    if (pre) {
      pre.scrollLeft = pre.scrollWidth;
    }
  });
  const scrolled = await fitAt(page, "玩家客户端");
  expect(scrolled.rightmostInPane, JSON.stringify(scrolled)).toBe(true);
  expect(scrolled.scrollerScrollWidth).toBeLessThan(
    scrolled.scrollerClientWidth + 48,
  );

  await reveal(page, "## panorama");
  await expect
    .poll(() => fitAt(page, "flowchart TB"), { timeout: 15000 })
    .toMatchObject({ svgInsidePre: true });
  const tall = await fitAt(page, "flowchart TB");
  expect(tall.svgWidth, JSON.stringify(tall)).toBeGreaterThan(400);
  expect(tall.svgWidth).toBeLessThan(900);
  expect(tall.svgHeight).toBeGreaterThan(1200);
  expect(tall.preClientHeight).toBeGreaterThanOrEqual(tall.svgHeight);
  expect(tall.scrollerScrollWidth).toBeLessThan(tall.scrollerClientWidth + 48);
});
