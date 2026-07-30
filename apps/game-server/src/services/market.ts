/**
 * MarketService — marketplace P2P: anúncio, compra, cancelamento. Move ouro
 * comprador→vendedor com TAXA (sink de economia) e registra tudo no ledger
 * append-only. Anti-P2W: só troca de itens/ouro entre jogadores.
 *
 * ⚠️ Escopo honesto: a ENTREGA do item ao comprador depende de um sistema de
 * inventário (o loot da sim ainda não persiste como instância de item). Hoje o
 * mercado é a economia de OURO + anúncios; a transferência do item entra quando
 * houver inventário.
 */
import type { MarketListing, Rarity } from "@pixel-idle/game-protocol";
import type { Store } from "../store/types";

export const MARKET_FEE = 0.05; // 5% de taxa (dreno de ouro)

interface Listing {
  id: string;
  sellerAccountId: string;
  sellerCharId: string;
  itemName: string;
  rarity: Rarity;
  price: number;
}

export class MarketService {
  private listings = new Map<string, Listing>();
  private seq = 0;

  constructor(private store: Store) {}

  list(sellerAccountId: string, itemName: string, rarity: Rarity, price: number): MarketListing {
    const char = this.store.charactersOfAccount(sellerAccountId)[0];
    if (!char) throw new Error("BAD_COMMAND");
    const l: Listing = {
      id: `lst_${++this.seq}`,
      sellerAccountId,
      sellerCharId: char.id,
      itemName,
      rarity,
      price,
    };
    this.listings.set(l.id, l);
    return this.view(l);
  }

  buy(buyerAccountId: string, listingId: string): void {
    const l = this.listings.get(listingId);
    if (!l) throw new Error("NO_LISTING");
    if (l.sellerAccountId === buyerAccountId) throw new Error("CANNOT_BUY_OWN");
    const buyer = this.store.charactersOfAccount(buyerAccountId)[0];
    const seller = this.store.getCharacter(l.sellerCharId);
    if (!buyer || !seller) throw new Error("BAD_COMMAND");
    if (buyer.gold < l.price) throw new Error("INSUFFICIENT_GOLD");

    const fee = Math.round(l.price * MARKET_FEE);
    buyer.gold -= l.price;
    seller.gold += l.price - fee;
    this.store.saveCharacter(buyer);
    this.store.saveCharacter(seller);
    this.store.appendLedger({
      id: this.store.nextId("led"),
      accountId: buyerAccountId,
      ref: `market:buy:${listingId}`,
      amount: -l.price,
      reason: "market-buy",
    });
    this.store.appendLedger({
      id: this.store.nextId("led"),
      accountId: l.sellerAccountId,
      ref: `market:sell:${listingId}`,
      amount: l.price - fee,
      reason: "market-sell",
    });
    this.listings.delete(listingId);
  }

  cancel(sellerAccountId: string, listingId: string): void {
    const l = this.listings.get(listingId);
    if (!l) throw new Error("NO_LISTING");
    if (l.sellerAccountId !== sellerAccountId) throw new Error("NOT_SELLER");
    this.listings.delete(listingId);
  }

  browse(): MarketListing[] {
    return [...this.listings.values()].map((l) => this.view(l));
  }

  private view(l: Listing): MarketListing {
    return {
      id: l.id,
      sellerAccountId: l.sellerAccountId,
      itemName: l.itemName,
      rarity: l.rarity,
      price: l.price,
    };
  }
}
