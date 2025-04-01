import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled
} from "../types"

let blocks: Map<string, string> = new Map();
let invalidatedTransactions: Map<string, string> = new Map();

function isAncestorOfOrSelf(crt: string, maybeAncestor: string): boolean {
  if (crt === maybeAncestor) {
    return true;
  }

  let currentBlock = crt;
  const visited = new Set<string>();
  
  while (blocks.has(currentBlock) && !visited.has(currentBlock)) {
    const parentBlock = blocks.get(currentBlock)!;
    visited.add(currentBlock);

    if (parentBlock === maybeAncestor) {
      return true;
    }

    currentBlock = parentBlock;
    if (!blocks.has(currentBlock)) {
      break;
    }
  }
  return false;
}

// in which block the transaction has been settled
let transactions: Map<string, string[]> = new Map();

function emitSettled(api: API, outputApi: OutputAPI, blockHash: string, transaction: string) {
  let info: Settled;
  if (api.isTxValid(blockHash, transaction)) {
    if (api.isTxSuccessful(blockHash, transaction)) {
      info = {blockHash, type: "valid", successful: true};
    } else {
      info = {blockHash, type: "valid", successful: false};
    }
  } else {
    info = {blockHash, type: "invalid"};
  }
  outputApi.onTxSettled(transaction, info);
}

function emitSettledInvalid(api: API, outputApi: OutputAPI, blockHash: string, transaction: string) 
{
  let info: Settled = {blockHash, type: "invalid"};
  outputApi.onTxSettled(transaction, info);
  if (invalidatedTransactions.has(transaction)) {
    const crtList = transactions.get(transaction);
    if (crtList == undefined) throw "";
    crtList.push(blockHash);
    transactions.set(transaction, crtList);
  } else {
    const newList = [];
    newList.push(blockHash);
    transactions.set(transaction, newList);
  }
}

function emitDoneInvalid(api: API, outputApi: OutputAPI, blockHash: string, transaction: string) 
{
  
}

function emitDone(api: API, outputApi: OutputAPI, blockHash: string, transaction: string) {
  let info: Settled;
  if (api.isTxValid(blockHash, transaction)) {
    if (api.isTxSuccessful(blockHash, transaction)) {
      info = {blockHash, type: "valid", successful: true};
    } else {
      info = {blockHash, type: "valid", successful: false};
    }
  } else {
    info = {blockHash, type: "invalid"};
  }
  outputApi.onTxDone(transaction, info);
}


export default function AndreyDodonov_EH(api: API, outputApi: OutputAPI) {

    const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
      blocks.set(blockHash, parent);
      const blockTransactions = api.getBody(blockHash);

      // check for invalid ones
      // ToDo: we also need to check if it got invalid in one of the parents 
      transactions.forEach((blockHashes, transaction) => {
        for (let i=0;i<blockHashes.length; i++) {
          if (!blockTransactions.includes(transaction)) {
            if (!api.isTxValid(blockHash, transaction)) {
              emitSettledInvalid(api, outputApi, blockHash, transaction);
            }
          }
        }
      });
      

      for (let i =0; i< blockTransactions.length; i++) {
        const transaction = blockTransactions[i];
        if (transactions.has(transaction)) {
          const crtList = transactions.get(transaction);
          if (crtList == undefined) throw "";
          crtList.push(blockHash);
          transactions.set(transaction, crtList);
        } else {
          const newList = [];
          newList.push(blockHash);
          transactions.set(transaction, newList);
        }
        emitSettled(api, outputApi, blockHash, blockTransactions[i]);
      }
    }

    const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
      const emptyList: string[] = [];
      transactions.set(transaction, emptyList);
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
      const transactionsToDelete: string[] = [];
      const finalized = blockHash;

      transactions.forEach((blockHashes, transaction) => {
        for (let i=0;i<blockHashes.length; i++) {
          if (isAncestorOfOrSelf(finalized, blockHashes[i])) {
            emitDone(api, outputApi, blockHash, transaction);
            break;
          }
        }
        transactionsToDelete.push(transaction);
      });
      for (let i = 0; i<transactionsToDelete.length; i++) {
        transactions.delete(transactionsToDelete[i]);
      }
    }

    return (event: IncomingEvent) => {
      switch (event.type) {
        case "newBlock": {
          onNewBlock(event)
          break
        }
        case "newTransaction": {
          onNewTx(event)
          break
        }
        case "finalized":
          onFinalized(event)
      }
    }
}
