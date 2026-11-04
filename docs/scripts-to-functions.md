# Shopify Scripts → Functions: three scripts, side by side

Three common Plus scripts, rebuilt as Functions. All three Functions run on the demo store.

The Ruby is a representative example written for this comparison. Scripts can't run on this store,
so it hasn't been executed. The Function behaviour below was tested live.

| Script | Function | Config |
|---|---|---|
| Line item: tiered discount, skip sale items | `tiered-discount` | `spend` |
| Line item: reject discount codes with sale items | `tiered-discount` | `rejectCodes` |
| Shipping: hide and rename rates | `delivery-customization` | `rules` |

## 1. Spend tiers that skip sale items

```ruby
eligible = Input.cart.line_items.reject do |item|
  compare_at = item.variant.compare_at_price
  compare_at && compare_at > item.variant.price
end

subtotal = eligible.map(&:line_price).reduce(Money.zero, :+)
percent = subtotal >= Money.new(cents: 15000) ? 10 : (subtotal >= Money.new(cents: 10000) ? 5 : 0)

eligible.each do |item|
  item.change_line_price(item.line_price * (1 - percent / 100.0), message: "Spend more, save more") if percent > 0
end

Output.cart = Input.cart
```

```json
"spend": {
  "tiers": [{"amount": 100, "percent": 5}, {"amount": 150, "percent": 10}],
  "label": "Spend more, save more",
  "excludeOnSale": true,
  "excludeGiftCards": true
}
```

What changes: the thresholds move from code to config, so a merchant can change them without a
developer. The discount also appears as a real discount, rather than a changed line price.

Live result: Serum $48 + Night Cream $52 + Exfoliator $18 (sale) → the tier sees $100 → $5.00 off.

## 2. Reject discount codes with sale items

```ruby
has_sale_item = Input.cart.line_items.any? do |item|
  compare_at = item.variant.compare_at_price
  compare_at && compare_at > item.variant.price
end

if has_sale_item && Input.cart.discount_code
  Input.cart.discount_code.reject(message: "Discount codes can't be used with sale items.")
end

Output.cart = Input.cart
```

```json
"rejectCodes": {
  "message": "Discount codes can't be used with sale items. Remove the sale item or the code.",
  "allowedCodes": ["STAFF20"]
}
```

The Function returns `enteredDiscountCodesReject`. Three things to know:

1. Only an automatic discount Function can reject a code. It reads `enteredDiscountCodes`.
2. Check `rejectable` first. Rejecting a code that isn't rejectable makes the Function result invalid.
3. A code in the URL (`?discount=`) is dropped with no message on screen. A typed code shows the message.

Live result: Exfoliator (sale) + Ceramide with `WELCOME10` → rejected with the message. Ceramide
alone with `WELCOME10` → $3.80 off, total $34.20.

## 3. Hide and rename shipping rates

```ruby
weight_kg = Input.cart.line_items.map { |item| item.grams * item.quantity }.sum / 1000.0
country = Input.cart.shipping_address&.country_code

Input.shipping_rates.delete_if { |rate| rate.name.include?("Express") && weight_kg >= 1 }

Input.shipping_rates.each do |rate|
  rate.change_name("Express — UPS 2nd Day Air") if rate.name.include?("Express") && country == "US"
end

Output.shipping_rates = Input.shipping_rates
```

```json
"rules": [
  {"action": "hide", "methods": ["Express"], "when": {"minWeightKg": 1}},
  {"action": "rename", "methods": ["Express"], "title": "Express — UPS 2nd Day Air", "when": {"countries": ["US"]}}
]
```

## What to check when you migrate

1. List what each script does for buyers, not what its code does.
2. Decide which discounts may stack. `combinesWith` replaces logic that used to sit in one script.
3. Test with a real cart. Function logs (`shopify app logs`) show the exact input.
4. Measure the instruction count with a large cart if the rules are heavy.
