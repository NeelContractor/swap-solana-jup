"use client"
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import React, { useCallback, useEffect, useState } from "react";

const assets = [
  {name: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9},
  { name: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6},
  { name: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  { name: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6},
];

const debaounce = <T extends unknown[]>(
  func: (...args: T) => void,
  wait: number
) => {
  let timeout: NodeJS.Timeout | undefined;

  return (...args: T) => {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  }
}

export default function Home() {
  const [fromAsset, setFromAsset] = useState(assets[0]);
  const [toAsset, setToAsset] = useState(assets[1]);
  const [fromAmount, setFromAmount] = useState(0);
  const [toAmount, setToAmount] = useState(0);
  const [quoteResponse, setQuoteResponse] = useState(null);

  const wallet = useWallet();

  const connection = new Connection('https://api.devnet.solana.com');

  const handleFromAssetChange = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setFromAsset(
      assets.find((asset) => asset.name === event?.target.value) || assets[0]
    )
  }

  const handleToAssetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setToAsset(
      assets.find((asset) => asset.name === event.target.value) || assets[0]
    )
  }

  const handleFromValueChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFromAmount(Number(event.target.value));
  }

  const debaounceQuoteCall = useCallback(debaounce(getQuote, 500), []);

  useEffect(() => {
    debaounceQuoteCall(fromAmount);
  }, [fromAmount, debaounceQuoteCall]);

  async function getQuote(currentAmount: number) {
    if (isNaN(currentAmount) || currentAmount <= 0) {
      console.error(`Invalid fromAmount value: ${currentAmount}`);
      return;
    
    }
    const quote = await (
      await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${fromAsset.mint}&outputMint=${toAsset.mint}&amount=${currentAmount * Math.pow(10, fromAsset.decimals)}&slippage=0.5`
      )
    ).json();

    if(quote && quote.outAmount) {
      const outAmountNumber = 
        Number(quote.outAmount) / Math.pow(10, toAsset.decimals);
      setToAmount(outAmountNumber);
    }
    setQuoteResponse(quote)
  }

  async function signAndSendTransaction() {
    if (!wallet.connected || !wallet.signTransaction) {
      console.error(
        "Wallet is not connected or does not support signing transactions"
      );
      return;
    }
    const { swapTransaction } = await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey?.toString(),
          wrapAndUnwarpSol: true,
        })
      })
    ).json();

    try {
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      const signedTransaction = await wallet.signTransaction(transaction);

      const rawTransaction = signedTransaction.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
      });

      const latestBlockHash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid
      }, 'confirmed')

      console.log(`https://solscan.io/tx/${txid}`);
    } catch (e) {
      console.error(`Error signing or sending the transaction: ${e}`);
    }
  }


  // useEffect(() => {
  //   if (connected) {
  //     console.log("Wallet Connected!");
  //   } else {
  //     console.log("Please Connect Your wallet")
  //   }
  // }, [connected, wallet]);

  return (
    <div className="grid">
      <div className="flex justify-between p-4">
      <div className="font-bold text-2xl self-center">Swap Token</div>
      <div>
        <WalletMultiButton  />
      </div>
    </div>
    <main className="flex items-center justify-center min-h-screen">
      <div className="border border-gray-600 p-20 rounded-lg">
        <div>
          <div>
            <h3 className="font-semibold text-lg">You Pay</h3>
            <input 
              type="number" 
              value={fromAmount}
              onChange={handleFromValueChange}
              className="bg-gray-800 rounded-lg outline-none p-2 w-96" 
            />
            <select 
              value={fromAsset.name}
              onChange={handleFromAssetChange}
              className=""
            >
              {assets.map((asset) => (
                <option key={asset.mint} value={asset.name}>
                  {asset.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <h3>You Receive</h3>
            <input 
              type="number" 
              value={toAmount}
              readOnly
              className="bg-gray-800 rounded-lg outline-none p-2 w-96" 
            />
            <select 
              value={fromAsset.name}
              onChange={handleToAssetChange}
              className=""
            >
              {assets.map((asset) => (
                <option key={asset.mint} value={asset.name}>
                  {asset.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button 
              onClick={signAndSendTransaction}
              className=""
              disabled={toAsset.mint === fromAsset.mint}  
            >
              Swap
            </button>
          </div>
        </div>
      </div>
    </main>
    </div>
    
  );
}
