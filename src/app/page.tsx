"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import React, { useCallback, useEffect, useState } from "react";

// List of assets available for swap
const assets = [
  { name: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  { name: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  { name: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  { name: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6 },
];

// Debounce function to prevent excessive API calls
const debounce = <T extends unknown[]>(
  func: (...args: T) => void,
  wait: number
) => {
  let timeout: NodeJS.Timeout | undefined;

  return (...args: T) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export default function Home() {
  const [fromAsset, setFromAsset] = useState(assets[0]);
  const [toAsset, setToAsset] = useState(assets[1]);
  const [fromAmount, setFromAmount] = useState(0);
  const [toAmount, setToAmount] = useState(0);
  const [quoteResponse, setQuoteResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const wallet = useWallet();
  const connection = new Connection('https://api.devnet.solana.com');

  const handleFromAssetChange = (event: { target: { value: string; }; }) => {
    const selectedAsset = assets.find(asset => asset.name === event.target.value);
    setFromAsset(selectedAsset || assets[0]);
  };

  const handleToAssetChange = (event: { target: { value: string; }; }) => {
    const selectedAsset = assets.find(asset => asset.name === event.target.value);
    setToAsset(selectedAsset || assets[0]);
  };

  const handleFromValueChange = (event: { target: { value: any; }; }) => {
    const value = Number(event.target.value);
    if (value >= 0) setFromAmount(value);
  };

  const debouncedGetQuote = useCallback(debounce(getQuote, 500), [fromAsset, toAsset]);

  useEffect(() => {
    if (fromAmount > 0) debouncedGetQuote(fromAmount);
  }, [fromAmount, debouncedGetQuote]);

  async function getQuote(amount: number) {
    try {
      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${fromAsset.mint}&outputMint=${toAsset.mint}&amount=${amount * 10 ** fromAsset.decimals}&slippage=0.5`
      );
      const quote = await response.json();
      if (quote && quote.outAmount) {
        const outAmount = Number(quote.outAmount) / 10 ** toAsset.decimals;
        setToAmount(outAmount);
        setQuoteResponse(quote);
      }
    } catch (error) {
      console.error('Error fetching quote:', error);
    }
  }

  async function signAndSendTransaction() {
    if (!wallet.connected || !wallet.signTransaction) {
      console.error("Wallet is not connected or doesn't support signing.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey?.toString(),
          wrapAndUnwrapSol: true,
        }),
      });

      const { swapTransaction } = await response.json();
      const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
      const signedTransaction = await wallet.signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
      });

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight, signature: txid },
        'confirmed'
      );

      console.log(`Transaction confirmed: https://solscan.io/tx/${txid}`);
    } catch (error) {
      console.error('Transaction failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <div className="flex justify-between p-4">
        <h1 className="font-bold text-2xl">Swap Token</h1>
        <WalletMultiButton />
      </div>

      <main className="flex items-center justify-center min-h-screen">
        <div className="grid justify-center border border-gray-600 p-20 rounded-lg">
          <div className="grid justify-center gap-2">
            <h3 className="font-semibold">You Pay</h3>
            <input
              type="number"
              value={fromAmount}
              onChange={handleFromValueChange}
              className="bg-gray-800 p-2 rounded-lg w-96"
            />
            <select onChange={handleFromAssetChange} value={fromAsset.name} className="bg-gray-800 p-2 rounded-lg w-full">
              {assets.map(asset => (
                <option key={asset.mint} value={asset.name}>{asset.name}</option>
              ))}
            </select>
          </div>

          <div className="grid justify-center gap-2 mt-2">
            <h3 className="font-semibold">You Receive</h3>
            <input type="number" value={toAmount} readOnly className="bg-gray-800 p-2 rounded-lg w-96" />
            <select onChange={handleToAssetChange} value={toAsset.name} className="bg-gray-800 p-2 rounded-lg w-full">
              {assets.map(asset => (
                <option key={asset.mint} value={asset.name}>{asset.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={signAndSendTransaction}
            disabled={fromAsset.mint === toAsset.mint || loading}
            className="bg-gray-800 p-2 rounded-lg font-bold w-full mt-2"
          >
            {loading ? 'Processing...' : 'Swap'}
          </button>
        </div>
      </main>
    </div>
  );
}
