CREATE POLICY "Creators can insert their own profile" ON star2fan_creators FOR INSERT WITH CHECK (auth.uid() = id);
