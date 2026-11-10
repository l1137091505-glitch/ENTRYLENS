# ENTRYLENS 部署步骤

## 1. GitHub

1. 在 GitHub 新建一个**空仓库**，例如 `entrylens`。
2. 不要额外勾选 README、License 或 `.gitignore`。
3. 解压 `ENTRYLENS-GITHUB-UPLOAD.zip`。
4. 把解压后的全部内容上传到仓库根目录并提交。

## 2. 在 Remix 部署合约

1. 打开 Remix，新建 `EntryLensRegistry.sol`。
2. 复制 `contracts/src/EntryLensRegistry.sol` 的全部内容。
3. Solidity 编译器选择 **0.8.24**。
4. 编译 `EntryLensRegistry.sol`。
5. 打开 **Deploy & Run Transactions**。
6. Environment 选择 Browser Extension / MetaMask。
7. 将钱包切换到 BOT Chain：
   - Chain ID：`677`
   - RPC：`https://rpc.botchain.ai`
   - Currency：`BOT`
   - Explorer：`https://scan.botchain.ai`
8. 部署 `EntryLensRegistry`。构造函数**没有参数**。
9. 复制完整合约地址。

## 3. 在 Vercel 导入

1. Vercel 点击 **Add New → Project**，导入 GitHub 仓库。
2. Root Directory 选择 `frontend`。
3. Framework Preset 选择 **Vite**。
4. Project Name 必须使用小写，例如 `entrylens`。
5. 添加 Production 环境变量：

```text
Key: VITE_ENTRYLENS_ADDRESS
Value: 你刚部署的完整合约地址
```

6. 点击 Deploy。

如果先部署了前端再添加环境变量：进入 **Environment Variables** 添加变量，然后到 Deployments 选择最新部署并点击 **Redeploy**。不要使用旧 Build Cache。

## 4. 网页交互

1. 点击右上角 **Connect wallet**。
2. 从弹窗选择已安装钱包。手机可使用 **Open this site in MetaMask mobile**。
3. 页面会请求切换或添加 BOT Chain。
4. 连接后，账户地址会自动填入 Scanner；也可以粘贴其他地址进行只读检查。
5. 点击 **Run checks**。
6. 可选：点击 **Test signature** 测试当前连接账户的消息签名能力。
7. 可选：点击 **Record report**，在钱包确认一笔合约交易，把报告哈希与分数写入链上。

## 5. 钱包兼容说明

本项目同时支持 EIP-6963 多钱包发现、旧版 `window.ethereum`、BOT Chain 自动切换/添加、账户与网络变化监听，以及 MetaMask 手机深链。第三方用户仍需安装钱包并在钱包内授权；网页不会也不应绕过钱包授权。

合约地址是公开信息，应作为 Config 环境变量；绝不要把助记词、私钥或钱包密码上传到 GitHub 或 Vercel。
