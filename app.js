(function () {
  "use strict";

  const RPC_URL = "https://sepolia-rpc.giwa.io";
  const CHAIN_ID = 91342;
  const TOKEN = "0x10B3Cc2fc981277Ada576891CF649D0ABA768B06";
  const WETH = "0x4200000000000000000000000000000000000006";
  const POOL = "0x1EF92A6a9BB4bBed2b385Dd5E688F88e7965BCf8";
  const CURVE = "0x1FD82a1BeAff168BdeFC790EB0f1A50f7C53b978";
  const VAULT = "0x016e6B1c6e73152eA8C33CDA7D960D08608f7c4b";
  const STAKING = "0x091d0B15121DD466e67DBE080E62C30D05b93C27";

  const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)"
  ];
  const POOL_ABI = [
    "function quoteExactIn(address tokenIn, uint256 amountIn) view returns (uint256)"
  ];
  const CURVE_ABI = [
    "function status() view returns (uint8)",
    "function canonicalPool() view returns (address)"
  ];
  const VAULT_ABI = [
    "function totalDeposited() view returns (uint256)"
  ];
  const STAKING_ABI = [
    "function periodEnd() view returns (uint256)"
  ];

  function init() {
    const el = (id) => document.getElementById(id);
    const setText = (id, value) => {
      const node = el(id);
      if (node) node.textContent = value;
    };

    function setStatus(message, isError = false) {
      setText("status", message);
      const node = el("status");
      if (node) node.classList.toggle("error", isError);
    }

    function errorText(error) {
      return String(
        error && (error.shortMessage || error.reason || error.message) ||
        "Unknown error"
      );
    }

    setText("tokAddress", TOKEN);
    setText("poolAddress", POOL);
    setText("vaultAddress", VAULT);
    setText("stakeAddress", STAKING);

    if (!window.ethers) {
      [
        "tokName", "tokSymbol", "tokDecimals", "tokSupply",
        "curveStatus", "canonicalPool", "vaultTotal",
        "stakePeriodEnd", "quoteOut", "quotePrice"
      ].forEach((id) => setText(id, "—"));
      setStatus("Error: ethers.js v6 could not be loaded.", true);
      return;
    }

    let provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    let refreshVersion = 0;
    let quoteVersion = 0;
    let quoteTimer;
    let connecting = false;

    // Lowercase addresses avoid checksum validation of configured mixed casing.
    function contracts(runner) {
      return {
        token: new ethers.Contract(TOKEN.toLowerCase(), ERC20_ABI, runner),
        pool: new ethers.Contract(POOL.toLowerCase(), POOL_ABI, runner),
        curve: new ethers.Contract(CURVE.toLowerCase(), CURVE_ABI, runner),
        vault: new ethers.Contract(VAULT.toLowerCase(), VAULT_ABI, runner),
        staking: new ethers.Contract(STAKING.toLowerCase(), STAKING_ABI, runner)
      };
    }

    function formatAmount(value, decimals, maxPlaces = decimals, fixed = false) {
      const parts = ethers.formatUnits(value, decimals).split(".");
      const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      let fraction = (parts[1] || "").slice(0, maxPlaces);
      fraction = fixed
        ? fraction.padEnd(maxPlaces, "0")
        : fraction.replace(/0+$/, "");
      return fraction ? whole + "." + fraction : whole;
    }

    function formatUTC(seconds) {
      const milliseconds = BigInt(seconds) * 1000n;
      if (milliseconds < 0n || milliseconds > 8640000000000000n) {
        throw new Error("Staking period end is outside the supported date range");
      }
      return new Date(Number(milliseconds))
        .toISOString()
        .replace("T", " ")
        .replace(".000Z", " UTC");
    }

    function clearQuote() {
      setText("quoteOut", "—");
      setText("quotePrice", "—");
    }

    async function updateQuote(version) {
      if (version !== quoteVersion) return;

      const amountNode = el("amount");
      const selected = document.querySelector('input[name="dir"]:checked');
      const direction = selected ? selected.value : "eth2tamm";
      const raw = amountNode ? amountNode.value.trim() : "";

      clearQuote();
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return;
      if (direction !== "eth2tamm" && direction !== "tamm2eth") return;

      const ethIn = direction === "eth2tamm";
      const inputDecimals = ethIn ? 18 : 6;
      const outputDecimals = ethIn ? 6 : 18;
      const outputSymbol = ethIn ? "tAMM" : "ETH";
      const inputSymbol = ethIn ? "ETH" : "tAMM";
      const currentProvider = provider;

      try {
        const amountIn = ethers.parseUnits(raw, inputDecimals);
        if (amountIn <= 0n || amountIn > ethers.MaxUint256) return;

        const pool = contracts(currentProvider).pool;
        const amountOut = await pool.quoteExactIn(
          (ethIn ? WETH : TOKEN).toLowerCase(),
          amountIn
        );

        if (version !== quoteVersion || currentProvider !== provider) return;

        // Compute the ratio entirely with integers to avoid floating-point loss.
        const priceDecimals = 18;
        const price = (
          amountOut * (10n ** BigInt(inputDecimals + priceDecimals))
        ) / (amountIn * (10n ** BigInt(outputDecimals)));

        setText(
          "quoteOut",
          formatAmount(amountOut, outputDecimals) + " " + outputSymbol
        );
        const formattedPrice = price === 0n && amountOut > 0n
          ? "<0.000000000000000001"
          : formatAmount(price, priceDecimals);
        setText(
          "quotePrice",
          formattedPrice + " " + outputSymbol + " per 1 " + inputSymbol
        );
      } catch (error) {
        if (version === quoteVersion && currentProvider === provider) {
          clearQuote();
        }
      }
    }

    function scheduleQuote(delay = 300) {
      clearTimeout(quoteTimer);
      const version = ++quoteVersion;
      clearQuote();
      quoteTimer = setTimeout(() => {
        void updateQuote(version);
      }, delay);
    }

    async function refresh() {
      const version = ++refreshVersion;
      const currentProvider = provider;
      const errors = [];
      setStatus("Updating…");

      const isCurrent = () =>
        version === refreshVersion && currentProvider === provider;

      async function fill(id, label, read, format = String) {
        try {
          const value = await read();
          const text = format(value);
          if (isCurrent()) setText(id, text);
        } catch (error) {
          errors.push(label + ": " + errorText(error));
          if (isCurrent()) {
            setText(id, "—");
            setStatus("Error: " + errors.join("; "), true);
          }
        }
      }

      try {
        const c = contracts(currentProvider);
        await Promise.all([
          fill("tokName", "Token name", () => c.token.name()),
          fill("tokSymbol", "Token symbol", () => c.token.symbol()),
          fill("tokDecimals", "Token decimals", () => c.token.decimals()),
          fill(
            "tokSupply",
            "Token supply",
            () => c.token.totalSupply(),
            (value) => formatAmount(value, 6, 6, true)
          ),
          fill(
            "curveStatus",
            "Curve status",
            () => c.curve.status(),
            (value) => BigInt(value) === 3n ? "3 (pool stage)" : String(value)
          ),
          fill("canonicalPool", "Canonical pool", () => c.curve.canonicalPool()),
          fill(
            "vaultTotal",
            "Vault total",
            () => c.vault.totalDeposited(),
            (value) => formatAmount(value, 18, 6) + " ETH"
          ),
          fill(
            "stakePeriodEnd",
            "Staking period end",
            () => c.staking.periodEnd(),
            formatUTC
          )
        ]);

        if (!isCurrent()) return;

        if (errors.length) {
          setStatus("Error: " + errors.join("; "), true);
        } else {
          setStatus("Last updated " + new Date().toLocaleTimeString());
        }
        scheduleQuote(0);
      } catch (error) {
        if (isCurrent()) {
          [
            "tokName", "tokSymbol", "tokDecimals", "tokSupply",
            "curveStatus", "canonicalPool", "vaultTotal", "stakePeriodEnd"
          ].forEach((id) => setText(id, "—"));
          setStatus("Error: " + errorText(error), true);
        }
      }
    }

    async function connectWallet() {
      if (connecting) return;

      if (!window.ethereum) {
        setStatus("No wallet found. Public RPC reads are being used.");
        return;
      }

      connecting = true;
      const button = el("connectBtn");
      if (button) button.disabled = true;

      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        provider = new ethers.BrowserProvider(window.ethereum);
        ++quoteVersion;
        clearTimeout(quoteTimer);
        clearQuote();
        await refresh();
      } catch (error) {
        setStatus("Wallet error: " + errorText(error), true);
      } finally {
        connecting = false;
        if (button) button.disabled = false;
      }
    }

    const amount = el("amount");
    if (amount) amount.addEventListener("input", () => scheduleQuote());

    document.querySelectorAll('input[name="dir"]').forEach((radio) => {
      radio.addEventListener("change", () => scheduleQuote());
    });

    const refreshButton = el("refreshBtn");
    if (refreshButton) {
      refreshButton.addEventListener("click", (event) => {
        event.preventDefault();
        void refresh();
      });
    }

    const connectButton = el("connectBtn");
    if (connectButton) {
      connectButton.addEventListener("click", (event) => {
        event.preventDefault();
        void connectWallet();
      });
    }

    clearQuote();
    void refresh();
    setInterval(() => {
      void refresh();
    }, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
