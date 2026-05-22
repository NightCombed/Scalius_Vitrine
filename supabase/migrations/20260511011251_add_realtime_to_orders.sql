-- Enable realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Set replica identity to full so we receive the old row in realtime payloads
ALTER TABLE orders REPLICA IDENTITY FULL;
