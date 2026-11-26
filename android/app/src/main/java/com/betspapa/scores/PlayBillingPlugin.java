package com.betspapa.scores;

import android.app.Activity;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Play Billing for the three Pro subscriptions. Products are created in Play Console, not here. */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    static final String[] PRODUCT_IDS = {
        "betspapa_pro_weekly",
        "betspapa_pro_monthly",
        "betspapa_pro_yearly"
    };

    private BillingClient client;
    private PluginCall purchaseCall;
    private final Map<String, ProductDetails> products = new HashMap<>();

    @PluginMethod
    public void products(PluginCall call) {
        connect(call, () -> query(call));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String id = call.getString("productId", "");
        if (id == null || id.isEmpty()) {
            call.reject("Choose a plan.");
            return;
        }
        connect(call, () -> launch(call, id));
    }

    @PluginMethod
    public void restore(PluginCall call) {
        connect(call, () -> restoreNow(call));
    }

    @PluginMethod
    public void acknowledge(PluginCall call) {
        String token = call.getString("purchaseToken", "");
        if (token == null || token.isEmpty() || client == null) {
            call.resolve();
            return;
        }
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build();
        client.acknowledgePurchase(params, result -> call.resolve());
    }

    private void connect(PluginCall call, Runnable next) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Google Play billing is not available on this device.");
            return;
        }
        if (client == null) {
            client = BillingClient.newBuilder(activity).setListener(this).enablePendingPurchases().build();
        }
        if (client.isReady()) {
            next.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) next.run();
                else call.reject("Google Play billing is not available on this device.");
            }

            @Override
            public void onBillingServiceDisconnected() {
                /* the next call connects again */
            }
        });
    }

    private void query(PluginCall call) {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : PRODUCT_IDS) {
            list.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.SUBS)
                .build());
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(list).build();
        client.queryProductDetailsAsync(params, (result, details) -> {
            JSArray rows = new JSArray();
            if (details != null) {
                for (ProductDetails item : details) {
                    products.put(item.getProductId(), item);
                    JSObject row = new JSObject();
                    row.put("id", item.getProductId());
                    row.put("price", formatted(item));
                    rows.put(row);
                }
            }
            JSObject out = new JSObject();
            out.put("products", rows);
            call.resolve(out);
        });
    }

    private void launch(PluginCall call, String id) {
        ProductDetails details = products.get(id);
        Activity activity = getActivity();
        List<ProductDetails.SubscriptionOfferDetails> offers = details == null ? null : details.getSubscriptionOfferDetails();
        if (activity == null || details == null || offers == null || offers.isEmpty()) {
            call.reject("That plan is not available in Play yet.");
            return;
        }
        purchaseCall = call;
        BillingFlowParams.ProductDetailsParams product = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offers.get(0).getOfferToken())
            .build();
        BillingFlowParams flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(Collections.singletonList(product))
            .build();
        BillingResult result = client.launchBillingFlow(activity, flow);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            purchaseCall = null;
            call.reject("Play did not open the purchase.");
        }
    }

    private void restoreNow(PluginCall call) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build();
        client.queryPurchasesAsync(params, (result, purchases) -> {
            JSArray rows = new JSArray();
            if (purchases != null) {
                for (Purchase purchase : purchases) {
                    if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                    if (purchase.getProducts().isEmpty()) continue;
                    JSObject row = new JSObject();
                    row.put("productId", purchase.getProducts().get(0));
                    row.put("purchaseToken", purchase.getPurchaseToken());
                    rows.put(row);
                }
            }
            JSObject out = new JSObject();
            out.put("purchases", rows);
            call.resolve(out);
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = purchaseCall;
        purchaseCall = null;
        if (call == null) return;
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject("Play did not complete the purchase.");
            return;
        }
        Purchase purchase = purchases.get(0);
        if (purchase.getProducts().isEmpty()) {
            call.reject("Play did not complete the purchase.");
            return;
        }
        JSObject out = new JSObject();
        out.put("productId", purchase.getProducts().get(0));
        out.put("purchaseToken", purchase.getPurchaseToken());
        call.resolve(out);
    }

    private static String formatted(ProductDetails details) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return "";
        List<ProductDetails.PricingPhase> phases = offers.get(0).getPricingPhases().getPricingPhaseList();
        if (phases == null || phases.isEmpty()) return "";
        return phases.get(0).getFormattedPrice();
    }
}
