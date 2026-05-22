-- Drop existing versions of create_public_order
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, text, timestamp with time zone, text, jsonb, text, text, text, text, text, text, uuid, text, numeric, integer, integer, text, text, integer, text, text);
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, text, timestamp with time zone, text, jsonb, text, text, text, text, text, text, uuid, text, numeric, integer, integer, text, text, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, text, timestamp with time zone, text, jsonb, text, text, text, text, text, text, uuid, text, numeric, integer, integer, text, text, integer, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, text, timestamp with time zone, text, jsonb, text, text, text, text, text, text, uuid, text, numeric, integer, integer, text, text, integer, text, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_store_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_type text,
  p_delivery_date timestamp with time zone,
  p_notes text,
  p_items jsonb,
  p_address_street text DEFAULT NULL::text,
  p_address_number text DEFAULT NULL::text,
  p_address_neighborhood text DEFAULT NULL::text,
  p_address_complement text DEFAULT NULL::text,
  p_pix_name text DEFAULT NULL::text,
  p_region_slug text DEFAULT NULL::text,
  p_delivery_zone_id uuid DEFAULT NULL::uuid,
  p_delivery_zone_name text DEFAULT NULL::text,
  p_delivery_distance_km numeric DEFAULT NULL::numeric,
  p_shipping_fee_override integer DEFAULT NULL::integer,
  p_shipping_service_id integer DEFAULT NULL::integer,
  p_shipping_service_name text DEFAULT NULL::text,
  p_shipping_company text DEFAULT NULL::text,
  p_shipping_delivery_time_days integer DEFAULT NULL::integer,
  p_customer_email text DEFAULT NULL::text,
  p_national_shipping_cep text DEFAULT NULL::text,
  p_address_city text DEFAULT NULL::text,
  p_address_state text DEFAULT NULL::text,
  p_customer_document text DEFAULT NULL::text,
  p_customer_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_store_id           uuid;
  v_region_id          uuid;
  v_region_name        text;
  v_shipping_fee_cents integer := 0;
  v_subtotal_cents     integer := 0;
  v_total_cents        integer;
  v_next_number        integer;
  v_order_number       text;
  v_order_id           uuid;
  v_item               jsonb;
  v_product_id         uuid;
  v_quantity           integer;
  v_product            record;
  v_line_total         integer;
  v_shipping_mode      text;
  v_zone               record;
  v_zone_price         integer;
  v_final_zone_name    text;
begin

  -- 1. Validações básicas
  if p_delivery_type not in ('delivery', 'pickup', 'national_shipping') then
    raise exception 'delivery_type inválido: %', p_delivery_type;
  end if;

  if p_customer_name is null or trim(p_customer_name) = '' then
    raise exception 'Nome do cliente é obrigatório';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Pedido deve conter ao menos um item';
  end if;

  -- 2. Buscar store pelo slug
  select id into v_store_id
  from public.stores
  where slug = p_store_slug and status = 'active';

  if v_store_id is null then
    raise exception 'Loja não encontrada ou inativa: %', p_store_slug;
  end if;

  -- Get store shipping mode
  select shipping_mode into v_shipping_mode
  from public.store_settings
  where store_id = v_store_id;

  v_shipping_mode := coalesce(v_shipping_mode, 'regions');

  -- 3. Calcular frete
  if p_delivery_type = 'delivery' or p_delivery_type = 'national_shipping' then
    if v_shipping_mode = 'distance' and p_delivery_zone_id is not null then
      -- Distance-based: validate zone and fee
      select id, name, max_distance_km, is_active, pricing_type, auto_min_fee_cents
      into v_zone
      from public.delivery_zones
      where id = p_delivery_zone_id
        and store_id = v_store_id
        and is_active = true;

      if v_zone.id is null then
        raise exception 'Zona de entrega não encontrada ou inativa';
      end if;
      
      v_final_zone_name := v_zone.name;

      -- Validate distance is within zone limit (using straight-line distance limit if configured)
      if v_zone.max_distance_km is not null and p_delivery_distance_km > v_zone.max_distance_km then
        raise exception 'Endereço fora do raio de entrega desta zona';
      end if;

      if v_zone.pricing_type = 'auto' then
         -- Auto mode: Front-end calculates the fee via OSRM, we just do a basic sanity check
         if p_shipping_fee_override is null then
           raise exception 'Taxa de entrega não calculada';
         end if;
         
         if v_zone.auto_min_fee_cents is not null and p_shipping_fee_override < v_zone.auto_min_fee_cents then
            v_shipping_fee_cents := v_zone.auto_min_fee_cents;
         else
            v_shipping_fee_cents := p_shipping_fee_override;
         end if;
         v_region_id := null;
         v_region_name := null;
      else
        -- Manual mode: validate price against distance_pricing table
        select price_cents into v_zone_price
        from public.distance_pricing
        where delivery_zone_id = p_delivery_zone_id
          and p_delivery_distance_km >= min_distance_km
          and p_delivery_distance_km < max_distance_km
        limit 1;

        if v_zone_price is null then
          raise exception 'Nenhuma faixa de preço encontrada para a distância informada';
        end if;

        v_shipping_fee_cents := v_zone_price;
        v_region_id := null;
        v_region_name := null;
      end if;

    elsif v_shipping_mode = 'regions' and p_region_slug is not null and trim(p_region_slug) != '' then
      -- Region-based (original logic)
      select id, name, fee_cents
      into v_region_id, v_region_name, v_shipping_fee_cents
      from public.shipping_regions
      where store_id = v_store_id
        and slug     = p_region_slug
        and is_active = true;

      if v_region_id is null then
        raise exception 'Região não encontrada ou inativa: %', p_region_slug;
      end if;

    else
      -- Distance mode but no zone provided, or Region mode with no region (could be National Shipping)
      if p_shipping_fee_override is not null and p_shipping_fee_override >= 0 then
        v_shipping_fee_cents := p_shipping_fee_override;
      else
        v_shipping_fee_cents := coalesce(p_shipping_fee_override, 0);
      end if;
    end if;
  end if;
  -- pickup: frete = 0, region = null

  -- 4. Gerar order_number sem race condition
  insert into public.store_order_counters (store_id, last_number)
  values (v_store_id, 1)
  on conflict (store_id)
  do update set last_number = store_order_counters.last_number + 1
  returning last_number into v_next_number;

  v_order_number := lpad(v_next_number::text, 5, '0');

  -- 5. Inserir pedido
  insert into public.orders (
    id,
    store_id,
    order_number,
    customer_name,
    customer_phone,
    customer_email,
    customer_document,
    customer_id,
    delivery_type,
    delivery_date,
    notes,
    subtotal_cents,
    shipping_fee_cents,
    total_cents,
    shipping_region_id,
    shipping_region_name,
    delivery_zone_id,
    delivery_zone_name,
    delivery_distance_km,
    address_street,
    address_number,
    address_neighborhood,
    address_complement,
    address_city,
    address_state,
    national_shipping_cep,
    pix_name,
    status,
    payment_status,
    shipping_service_id,
    shipping_service_name,
    shipping_company,
    shipping_delivery_time_days
  ) values (
    gen_random_uuid(),
    v_store_id,
    v_order_number,
    trim(p_customer_name),
    p_customer_phone,
    p_customer_email,
    p_customer_document,
    p_customer_id,
    p_delivery_type,
    p_delivery_date,
    p_notes,
    0,
    v_shipping_fee_cents,
    0,
    v_region_id,
    v_region_name,
    p_delivery_zone_id,
    coalesce(p_delivery_zone_name, v_final_zone_name),
    p_delivery_distance_km,
    p_address_street,
    p_address_number,
    p_address_neighborhood,
    p_address_complement,
    p_address_city,
    p_address_state,
    p_national_shipping_cep,
    p_pix_name,
    'pending',
    'unpaid',
    p_shipping_service_id,
    p_shipping_service_name,
    p_shipping_company,
    p_shipping_delivery_time_days
  )
  returning id into v_order_id;

  -- 6. Itens e Controle de Estoque
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    if v_product_id is null then
      raise exception 'product_id inválido no item';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantidade inválida para produto %', v_product_id;
    end if;

    select id, name, price_cents, stock_qty
    into v_product
    from public.products
    where id       = v_product_id
      and store_id = v_store_id
      and is_active = true
    FOR UPDATE;

    if v_product.id is null then
      raise exception 'Produto não encontrado ou inativo: %', v_product_id;
    end if;

    if v_product.stock_qty is not null then
      if v_product.stock_qty < v_quantity then
        raise exception 'Produto "%" não possui estoque suficiente (disponível: %)', v_product.name, v_product.stock_qty;
      end if;

      update public.products
      set stock_qty = stock_qty - v_quantity
      where id = v_product_id;
    end if;

    v_line_total     := v_product.price_cents * v_quantity;
    v_subtotal_cents := v_subtotal_cents + v_line_total;

    insert into public.order_items (
      order_id,
      store_id,
      product_id,
      product_name,
      unit_price_cents,
      quantity,
      line_total_cents
    ) values (
      v_order_id,
      v_store_id,
      v_product.id,
      v_product.name,
      v_product.price_cents,
      v_quantity,
      v_line_total
    );
  end loop;

  -- 7. Atualizar totais
  v_total_cents := v_subtotal_cents + v_shipping_fee_cents;

  update public.orders
  set
    subtotal_cents = v_subtotal_cents,
    total_cents    = v_total_cents
  where id = v_order_id;

  -- 8. Retornar
  return jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number,
    'subtotal',     v_subtotal_cents,
    'shipping_fee', v_shipping_fee_cents,
    'total',        v_total_cents
  );

end;
$function$;
